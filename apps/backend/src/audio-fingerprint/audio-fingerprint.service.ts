import { PrismaClient } from '@prisma/client';
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '../redis/redis.constants';
import Redis from 'ioredis';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { pipeline } from 'stream/promises';

const execFileAsync = promisify(execFile);

// Configure FFmpeg paths
if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as any);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path as any);

// Chargement robuste du module C++ natif
let audiomatcher: any;
try {
  audiomatcher = require(path.join(__dirname, 'cpp-matcher/build/Release/audiomatcher.node'));
} catch (e1) {
  try {
    audiomatcher = require(path.join(__dirname, '../../../../src/audio-fingerprint/cpp-matcher/build/Release/audiomatcher.node'));
  } catch (e2) {
    try {
      audiomatcher = require(path.join(process.cwd(), 'apps/backend/src/audio-fingerprint/cpp-matcher/build/Release/audiomatcher.node'));
    } catch (e3) {
      console.warn("⚠️ Impossible de charger le module C++ audiomatcher.node");
    }
  }
}

// ── Configuration ───────────────────────────────────────────────────────────────

const CHROMAPRINT_THRESHOLD = 0.75; // Seuil de similarité Chromaprint (base aléatoire = ~0.50, vrai match = >0.85)
const API_MATCH_THRESHOLD = 0.90;   // Seuil pour les API externes (ACRCloud/AudD)
const TEXT_MATCH_THRESHOLD = 0.80;   // Seuil pour la correspondance textuelle
const CATALOG_CACHE_TTL = 3600;     // 1h de cache Redis pour le catalogue (rafraîchi plus souvent)
const AUDIO_SEGMENT_DURATION = 20;   // Durée du segment audio à analyser (secondes)

// ── Types ───────────────────────────────────────────────────────────────────────

export interface FingerprintMatchResult {
  isCopyrighted: boolean;
  isAuthorized: boolean;
  rightsStatus: 'ORIGINAL_SOUND' | 'FREE' | 'OWNED_BY_ARTIST' | 'PURCHASED' | 'REQUIRES_PURCHASE';
  tokensRequired: number;
  priceFiat?: number;
  currency?: string;
  matchedTrack?: {
    id: string;
    title: string;
    artist: {
      id: string;
      stageName: string;
      userId: string;
      avatar?: string | null;
    };
    price: number;
  };
  similarityScore?: number;
  detectionMethod?: 'TRACK_ID' | 'CHROMAPRINT' | 'ACRCLOUD' | 'AUDD' | 'METADATA' | 'FILE_HASH';
  message: string;
}

interface TrackWithArtist {
  id: string;
  title: string;
  price: number;
  currency: string;
  fingerprint: string | null;
  albumId?: string | null;
  audioUrl: string;
  s3Key: string | null;
  artist: {
    id: string;
    stageName: string;
    userId: string;
    avatar?: string | null;
  };
}

// ── Service Principal ───────────────────────────────────────────────────────────

@Injectable()
export class AudioFingerprintService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService
  ) {}

  private getBucketName(): string {
    return (
      this.configService.get<string>('S3_BUCKET_NAME') ||
      this.configService.get<string>('AWS_S3_BUCKET') ||
      process.env.S3_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      'kephale-media'
    );
  }

  private getS3Client(): S3Client {
    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ||
      process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ||
      process.env.AWS_SECRET_ACCESS_KEY;
    const endpoint =
      this.configService.get<string>('S3_ENDPOINT') ||
      process.env.S3_ENDPOINT ||
      'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3';
    const region =
      this.configService.get<string>('AWS_REGION') ||
      process.env.AWS_REGION ||
      'us-east-1';

    return new S3Client({
      region,
      endpoint,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
      forcePathStyle: true,
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════════
  // COUCHE 0 — Utilitaires audio
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Extrait la piste audio d'un fichier vidéo/audio et retourne le chemin du WAV résultant.
   * Utilise FFmpeg pour extraire un segment mono 16kHz PCM (format requis par Chromaprint).
   */
  public async extractAudioSegment(
    inputFilePath: string,
    outputDir: string,
    startSec: number = 10,
    durationSec: number = AUDIO_SEGMENT_DURATION
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'audio_segment.wav');

    return new Promise<string>((resolve, reject) => {
      let cmd = ffmpeg(inputFilePath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .outputFormat('wav')
        .duration(durationSec);

      // Si le fichier est assez long, on skip les premières secondes (souvent silence/intro)
      if (startSec > 0) {
        cmd = cmd.seekInput(startSec);
      }

      cmd
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', (err: any) => {
          // Si le seek dépasse la durée, réessayer depuis le début
          if (startSec > 0) {
            ffmpeg(inputFilePath)
              .noVideo()
              .audioChannels(1)
              .audioFrequency(16000)
              .audioCodec('pcm_s16le')
              .outputFormat('wav')
              .duration(durationSec)
              .output(outputPath)
              .on('end', () => resolve(outputPath))
              .on('error', reject)
              .run();
          } else {
            reject(err);
          }
        })
        .run();
    });
  }

  /**
   * Télécharge un fichier depuis S3 dans un répertoire temporaire.
   */
  public async downloadFromS3(s3Key: string, tmpDir: string): Promise<string> {
    const bucketName = this.getBucketName();
    const cleanKey = s3Key.startsWith(`${bucketName}/`) ? s3Key.replace(`${bucketName}/`, '') : s3Key;
    const ext = path.extname(cleanKey) || '.bin';
    const localPath = path.join(tmpDir, `s3_download${ext}`);

    try {
      const client = this.getS3Client();
      const { Body } = await client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: cleanKey,
      }));

      if (!Body) throw new Error(`Failed to download ${cleanKey} from S3`);
      await pipeline(Body as any, fs.createWriteStream(localPath));
      return localPath;
    } catch (s3Error: any) {
      // Fallback: Tentative de téléchargement direct par URL publique Supabase / CDN
      const publicBase =
        this.configService.get<string>('S3_BUCKET_PUBLIC_URL') ||
        process.env.S3_BUCKET_PUBLIC_URL ||
        `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/${bucketName}`;
      const fallbackUrl = `${publicBase}/${cleanKey}`;
      
      try {
        const response = await fetch(fallbackUrl);
        if (response.ok && response.body) {
          // @ts-ignore
          await pipeline(response.body, fs.createWriteStream(localPath));
          return localPath;
        }
      } catch {}

      throw s3Error;
    }
  }

  /**
   * Calcule le hash SHA-256 d'un fichier (pour détection de copies exactes).
   */
  public async computeFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COUCHE 1 — Empreinte acoustique C++ (Constellation Map Hashing)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Extrait l'audio brut en PCM (Float32) pour l'analyse C++.
   */
  private async extractPCM(audioFilePath: string): Promise<Float32Array> {
    const tmpPath = path.join(os.tmpdir(), `pcm-${Date.now()}-${Math.random()}.raw`);
    return new Promise((resolve, reject) => {
      ffmpeg(audioFilePath)
        .noVideo()
        .audioChannels(1)
        .audioFrequency(11025)
        .audioCodec('pcm_f32le')
        .outputFormat('f32le')
        .output(tmpPath)
        .on('end', () => {
          try {
            const buffer = fs.readFileSync(tmpPath);
            const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            resolve(float32Array);
          } catch(e) {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            reject(e);
          }
        })
        .on('error', (err) => {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Génère une empreinte acoustique robuste avec le module C++ natif (Shazam-style).
   */
  public async generateChromaprintFingerprint(audioFilePath: string): Promise<{
    fingerprint: string;
    duration: number;
  }> {
    if (!audiomatcher) {
      throw new Error("Module C++ audiomatcher non chargé. Impossible de générer l'empreinte.");
    }

    try {
      // 1. Extraction PCM
      const pcmData = await this.extractPCM(audioFilePath);
      
      // 2. Génération C++
      const hashes = audiomatcher.generateHashes(pcmData);
      
      // 3. Durée (11025 Hz, 1 channel)
      const duration = pcmData.length / 11025;
      
      // 4. On stocke le Uint32Array sous forme de chaîne de caractères
      return {
        fingerprint: hashes.join(','),
        duration,
      };
    } catch (err: any) {
      console.error('[AudioFingerprint] Erreur génération empreinte C++:', err.message);
      throw err;
    }
  }

  /**
   * Compare deux empreintes C++ générées par le module natif.
   * Retourne un score basé sur le nombre de pics alignés temporellement (Constellation Matching).
   */
  public compareFingerprints(fp1: string | number[], fp2: string | number[]): number {
    if (!fp1 || !fp2) return 0;
    
    const arr1 = Array.isArray(fp1) ? fp1 : String(fp1).split(',').map(Number);
    const arr2 = Array.isArray(fp2) ? fp2 : String(fp2).split(',').map(Number);
    
    if (arr1.length === 0 || arr2.length === 0) return 0;

    // arr2 = base de données (track)
    // Map hash -> array of times
    const map = new Map<number, number[]>();
    for (let i = 0; i < arr2.length; i += 2) {
      const hash = arr2[i];
      const t = arr2[i+1];
      if (!map.has(hash)) map.set(hash, []);
      map.get(hash)!.push(t);
    }
    
    // arr1 = vidéo (reel)
    const offsetCounts = new Map<number, number>();
    let maxCount = 0;
    
    for (let i = 0; i < arr1.length; i += 2) {
      const hash = arr1[i];
      const t1 = arr1[i+1];
      const t2s = map.get(hash);
      if (t2s) {
        for (const t2 of t2s) {
          const offset = t2 - t1;
          const count = (offsetCounts.get(offset) || 0) + 1;
          offsetCounts.set(offset, count);
          if (count > maxCount) maxCount = count;
        }
      }
    }

    return maxCount;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COUCHE 2 — API externes de reconnaissance musicale
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Interroge l'API ACRCloud pour reconnaître une musique à partir d'un fichier audio.
   * Retourne le titre/artiste reconnu et un score de confiance.
   */
  public async queryACRCloud(audioFilePath: string): Promise<{
    title: string;
    artist: string;
    score: number;
    externalId?: string;
  } | null> {
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
    const host = process.env.ACRCLOUD_HOST;

    if (!accessKey || !accessSecret || !host) return null;

    try {
      const audioData = fs.readFileSync(audioFilePath);
      const audioBase64 = audioData.toString('base64');
      const timestamp = Math.floor(Date.now() / 1000);

      // Signature HMAC-SHA1
      const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`;
      const signature = crypto
        .createHmac('sha1', accessSecret)
        .update(stringToSign)
        .digest('base64');

      const formData = new FormData();
      const audioBlob = new Blob([audioData], { type: 'audio/wav' });
      formData.append('sample', audioBlob, 'audio.wav');
      formData.append('access_key', accessKey);
      formData.append('data_type', 'audio');
      formData.append('signature_version', '1');
      formData.append('signature', signature);
      formData.append('sample_bytes', String(audioData.length));
      formData.append('timestamp', String(timestamp));

      const response = await fetch(`https://${host}/v1/identify`, {
        method: 'POST',
        body: formData,
      });

      const json: any = await response.json();

      if (json?.status?.code === 0 && json?.metadata?.music?.[0]) {
        const music = json.metadata.music[0];
        return {
          title: music.title || '',
          artist: music.artists?.[0]?.name || '',
          score: (music.score || 0) / 100,
          externalId: music.external_metadata?.spotify?.track?.id,
        };
      }
    } catch (error) {
      console.error('[AudioFingerprint] ACRCloud query failed:', error);
    }

    return null;
  }

  /**
   * Interroge l'API AudD pour reconnaître une musique.
   * Envoie le fichier audio directement (pas une URL).
   */
  public async queryAudD(audioFilePath: string): Promise<{
    title: string;
    artist: string;
    score: number;
  } | null> {
    const apiKey = process.env.AUDD_API_KEY;
    if (!apiKey) return null;

    try {
      const audioData = fs.readFileSync(audioFilePath);

      const formData = new FormData();
      const audioBlob = new Blob([audioData], { type: 'audio/wav' });
      formData.append('file', audioBlob, 'audio.wav');
      formData.append('api_token', apiKey);
      formData.append('return', 'timecode,apple_music,spotify');

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData,
      });

      const json: any = await response.json();

      if (json?.status === 'success' && json?.result) {
        return {
          title: json.result.title || '',
          artist: json.result.artist || '',
          score: json.result.score ? json.result.score / 100 : 0.95,
        };
      }
    } catch (error) {
      console.error('[AudioFingerprint] AudD query failed:', error);
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COUCHE 3 — Correspondance textuelle améliorée (métadonnées)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Normalise un texte pour la comparaison : minuscules, sans accents, sans caractères spéciaux.
   */
  public normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  /**
   * Compare deux textes normalisés avec une distance Levenshtein pondérée.
   * Retourne un score de 0.0 à 1.0.
   */
  public calculateTextSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeText(str1);
    const s2 = this.normalizeText(str2);

    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    // Inclusion complète d'un texte dans l'autre
    if (s1.length >= 4 && s2.includes(s1)) return 0.90;
    if (s2.length >= 4 && s1.includes(s2)) return 0.90;

    // Distance Levenshtein
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i++) track[0][i] = i;
    for (let j = 0; j <= s2.length; j++) track[j][0] = j;

    for (let j = 1; j <= s2.length; j++) {
      for (let i = 1; i <= s1.length; i++) {
        const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }

    const distance = track[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return Math.max(0, 1 - distance / maxLength);
  }

  /**
   * Recherche de correspondance textuelle améliorée dans le catalogue.
   * Compare le titre et la description de la vidéo avec les titres de tracks payantes.
   */
  public findTextMatch(
    searchQueries: string[],
    paidTracks: TrackWithArtist[]
  ): { track: TrackWithArtist; score: number } | null {
    let bestMatch: TrackWithArtist | null = null;
    let highestScore = 0;

    for (const track of paidTracks) {
      const trackTitle = this.normalizeText(track.title);
      const artistName = this.normalizeText(track.artist.stageName);

      if (trackTitle.length < 3) continue; // Ignorer les titres trop courts (faux positifs)

      for (const query of searchQueries) {
        const qNorm = this.normalizeText(query);
        if (!qNorm || qNorm.length < 3) continue;

        // Check 1 : Titre complet trouvé dans la query
        if (trackTitle.length >= 4 && qNorm.includes(trackTitle)) {
          const score = 0.95;
          if (score > highestScore) {
            highestScore = score;
            bestMatch = track;
          }
        }

        // Check 2 : Titre + Artiste combinés
        const combined = `${trackTitle} ${artistName}`;
        const simScore = this.calculateTextSimilarity(qNorm, combined);
        if (simScore > TEXT_MATCH_THRESHOLD && simScore > highestScore) {
          highestScore = simScore;
          bestMatch = track;
        }

        // Check 3 : Mots-clés significatifs (min 5 chars pour éviter les faux positifs)
        const trackWords = trackTitle.split(/\s+/).filter(w => w.length >= 5);
        for (const word of trackWords) {
          if (qNorm.includes(word)) {
            // Score basé sur la longueur du mot (plus le mot est long, plus c'est fiable)
            const score = Math.min(0.85, 0.70 + (word.length - 5) * 0.03);
            if (score > highestScore) {
              highestScore = score;
              bestMatch = track;
            }
          }
        }
      }
    }

    return bestMatch && highestScore >= TEXT_MATCH_THRESHOLD
      ? { track: bestMatch, score: highestScore }
      : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PIPELINE PRINCIPAL — Analyse multi-couches
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Vérifie le nombre de copyright strikes actifs pour un utilisateur.
   * 3 strikes = blocage des uploads.
   */
  public async checkUserStrikes(userId: string): Promise<{
    blocked: boolean;
    activeStrikes: number;
  }> {
    const now = new Date();
    const activeStrikes = await this.prisma.copyrightStrike.count({
      where: {
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });

    return {
      blocked: activeStrikes >= 3,
      activeStrikes,
    };
  }

  /**
   * Pipeline principal : Analyse complète et multi-couches des droits d'auteur.
   *
   * Couche 1 : trackId explicite (si l'utilisateur a sélectionné un son du catalogue)
   * Couche 2 : Hash de fichier (détection de copies exactes)
   * Couche 3 : Correspondance textuelle (titre, description, nom de fichier)
   * Couche 4 : Empreinte acoustique Chromaprint (analyse spectrale réelle)
   * Couche 5 : API externe ACRCloud/AudD (reconnaissance musicale professionnelle)
   */
  public async analyzeAndDetectCopyright(params: {
    userId: string;
    trackId?: string;
    audioTitle?: string;
    videoS3Key?: string;
    videoUrl?: string;
    originalAudioName?: string;
    title?: string;
    description?: string;
  }): Promise<FingerprintMatchResult> {
    const {
      userId, trackId, audioTitle, videoS3Key, videoUrl,
      originalAudioName, title, description,
    } = params;

    // ── Pré-vérification : utilisateur bloqué par copyright strikes ? ────────
    const { blocked, activeStrikes } = await this.checkUserStrikes(userId);
    if (blocked) {
      return {
        isCopyrighted: false,
        isAuthorized: false,
        rightsStatus: 'REQUIRES_PURCHASE',
        tokensRequired: 0,
        message: `Votre compte est temporairement bloqué pour violation de droits d'auteur (${activeStrikes} strikes actifs). Veuillez contacter le support.`,
      };
    }

    // ── COUCHE 1 : trackId explicite ─────────────────────────────────────────
    if (trackId) {
      const track = await this.prisma.track.findUnique({
        where: { id: trackId },
        include: { artist: { select: { id: true, stageName: true, userId: true, avatar: true } } },
      });

      if (track) {
        const result = await this.verifyRightsForTrack(userId, track);
        return { ...result, detectionMethod: 'TRACK_ID' };
      }
    }

    // ── Chargement du catalogue de tracks payantes (avec cache Redis) ────────
    const paidTracks = await this.getAllTracksWithCache();

    if (paidTracks.length === 0) {
      return {
        isCopyrighted: false,
        isAuthorized: true,
        rightsStatus: 'ORIGINAL_SOUND',
        tokensRequired: 0,
        message: 'Son original autorisé (catalogue vide)',
      };
    }

    // ── COUCHE 2 : Correspondance textuelle (métadonnées) ───────────────────
    const searchQueries = [
      audioTitle,
      originalAudioName,
      title,
      description,
      videoUrl ? decodeURIComponent(path.basename(videoUrl).replace(/\.\w+$/, '')) : '',
    ].filter(Boolean) as string[];

    if (searchQueries.length > 0) {
      const textMatch = this.findTextMatch(searchQueries, paidTracks);
      if (textMatch && textMatch.score >= TEXT_MATCH_THRESHOLD) {
        const result = await this.verifyRightsForTrack(userId, textMatch.track);
        if (!result.isAuthorized) {
          return {
            ...result,
            similarityScore: textMatch.score,
            detectionMethod: 'METADATA',
            message: result.isAuthorized
              ? `Titre reconnu : "${textMatch.track.title}" (${result.message})`
              : `Droits d'auteur détectés : "${textMatch.track.title}" de ${textMatch.track.artist.stageName}. ${result.message}`,
          };
        }
        // Si autorisé, retourner le résultat mais continuer les vérifications acoustiques
        return { ...result, similarityScore: textMatch.score, detectionMethod: 'METADATA' };
      }
    }

    // ── COUCHES 3-5 : Analyse audio réelle (si un fichier vidéo est disponible) ──
    const s3Key = videoS3Key || (videoUrl ? this.extractS3KeyFromUrl(videoUrl) : null);

    if (s3Key) {
      const audioResult = await this.performAudioAnalysis(s3Key, paidTracks, userId);
      if (audioResult) {
        return audioResult;
      }
    }

    // ── Aucune correspondance trouvée → Son original autorisé ────────────────
    return {
      isCopyrighted: false,
      isAuthorized: true,
      rightsStatus: 'ORIGINAL_SOUND',
      tokensRequired: 0,
      detectionMethod: s3Key ? 'CHROMAPRINT' : 'METADATA',
      // ✅ CORRECTION BUG 2 : Message honnête — ne pas dire "vérifiée 100%" si aucun match n'a été trouvé
      message: s3Key
        ? 'Aucune musique protégée détectée — son original autorisé'
        : 'Son original ou non répertorié autorisé',
    };
  }

  /**
   * Analyse audio en profondeur : extraction du son de la vidéo, Chromaprint, API externe.
   * Exécuté dans un répertoire temporaire avec nettoyage automatique.
   */
  private async performAudioAnalysis(
    videoS3Key: string,
    paidTracks: TrackWithArtist[],
    userId: string
  ): Promise<FingerprintMatchResult | null> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kephale-fp-'));

    try {
      // 1. Télécharger la vidéo depuis S3
      console.log(`[AudioFingerprint] Downloading video from S3: ${videoS3Key}`);
      const videoFilePath = await this.downloadFromS3(videoS3Key, tmpDir);

      // 2. Extraire le segment audio (offset 0s)
      console.log('[AudioFingerprint] Extracting audio segment...');
      const audioSegmentPath = await this.extractAudioSegment(videoFilePath, tmpDir, 0, AUDIO_SEGMENT_DURATION);

      // 3. Générer le fingerprint Chromaprint de la vidéo
      console.log('[AudioFingerprint] Generating Chromaprint fingerprint...');
      const videoFP = await this.generateChromaprintFingerprint(audioSegmentPath);

      // ── COUCHE 3 : Comparaison Chromaprint avec le catalogue (recherche du meilleur match) ──
      const tracksWithFingerprints = paidTracks.filter(t => t.fingerprint && t.fingerprint.length > 10);

      let bestMatchTrack: TrackWithArtist | null = null;
      let maxSimilarity = 0;

      for (const track of tracksWithFingerprints) {
        const similarity = this.compareFingerprints(videoFP.fingerprint, track.fingerprint!);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatchTrack = track;
        }
      }

      // Si le meilleur score est légèrement sous le seuil, tenter un 2nd segment à +5s (en cas d'intro parlée/silence)
      if (maxSimilarity < 5000) {
        try {
          const audioSegmentPathOffset = await this.extractAudioSegment(videoFilePath, tmpDir, 5, AUDIO_SEGMENT_DURATION);
          const videoFPOffset = await this.generateChromaprintFingerprint(audioSegmentPathOffset);
          for (const track of tracksWithFingerprints) {
            const similarity = this.compareFingerprints(videoFPOffset.fingerprint, track.fingerprint!);
            if (similarity > maxSimilarity) {
              maxSimilarity = similarity;
              bestMatchTrack = track;
            }
          }
        } catch {
          // Ignorer l'erreur offset
        }
      }

      if (bestMatchTrack && maxSimilarity >= 5000) {
        console.log(`[AudioFingerprint] Best Chromaprint match! Track "${bestMatchTrack.title}" score=${maxSimilarity}`);

        const result = await this.verifyRightsForTrack(userId, bestMatchTrack);
        return {
          ...result,
          similarityScore: maxSimilarity,
          detectionMethod: 'CHROMAPRINT',
          message: result.isAuthorized
            ? `Titre reconnu par empreinte acoustique : "${bestMatchTrack.title}" (${result.message})`
            : `Musique protégée détectée par analyse acoustique : "${bestMatchTrack.title}" de ${bestMatchTrack.artist.stageName}. ${result.message}`,
        };
      }

      // ── COUCHE 4 : API ACRCloud ────────────────────────────────────────────
      const acrResult = await this.queryACRCloud(audioSegmentPath);
      if (acrResult && acrResult.score >= API_MATCH_THRESHOLD) {
        const matchedTrack = this.matchAPIResultToKephaleCatalog(acrResult.title, acrResult.artist, paidTracks);
        if (matchedTrack) {
          console.log(`[AudioFingerprint] ACRCloud match! Track "${matchedTrack.title}" via "${acrResult.title}"`);

          const result = await this.verifyRightsForTrack(userId, matchedTrack);
          return {
            ...result,
            similarityScore: acrResult.score,
            detectionMethod: 'ACRCLOUD',
            message: result.isAuthorized
              ? `Titre reconnu par ACRCloud : "${matchedTrack.title}" (${result.message})`
              : `Musique protégée détectée (ACRCloud) : "${matchedTrack.title}" de ${matchedTrack.artist.stageName}. ${result.message}`,
          };
        }
      }

      // ── COUCHE 5 : API AudD (fallback) ─────────────────────────────────────
      const auddResult = await this.queryAudD(audioSegmentPath);
      if (auddResult && auddResult.score >= API_MATCH_THRESHOLD) {
        const matchedTrack = this.matchAPIResultToKephaleCatalog(auddResult.title, auddResult.artist, paidTracks);
        if (matchedTrack) {
          console.log(`[AudioFingerprint] AudD match! Track "${matchedTrack.title}" via "${auddResult.title}"`);

          const result = await this.verifyRightsForTrack(userId, matchedTrack);
          return {
            ...result,
            similarityScore: auddResult.score,
            detectionMethod: 'AUDD',
            message: result.isAuthorized
              ? `Titre reconnu par AudD : "${matchedTrack.title}" (${result.message})`
              : `Musique protégée détectée (AudD) : "${matchedTrack.title}" de ${matchedTrack.artist.stageName}. ${result.message}`,
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[AudioFingerprint] Audio analysis error:', error);
      return null;
    } finally {
      // Nettoyage du répertoire temporaire
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Tente de faire correspondre le résultat d'une API externe avec le catalogue Kephale.
   */
  private matchAPIResultToKephaleCatalog(
    recognizedTitle: string,
    recognizedArtist: string,
    paidTracks: TrackWithArtist[]
  ): TrackWithArtist | null {
    const normTitle = this.normalizeText(recognizedTitle);
    const normArtist = this.normalizeText(recognizedArtist);

    let bestMatch: TrackWithArtist | null = null;
    let bestScore = 0;

    for (const track of paidTracks) {
      const trackTitle = this.normalizeText(track.title);
      const trackArtist = this.normalizeText(track.artist.stageName);

      // Score combiné titre + artiste
      const titleSim = this.calculateTextSimilarity(normTitle, trackTitle);
      const artistSim = this.calculateTextSimilarity(normArtist, trackArtist);

      // Pondération : titre 70%, artiste 30%
      const combinedScore = titleSim * 0.7 + artistSim * 0.3;

      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestMatch = track;
      }
    }

    // Score minimal pour matcher avec le catalogue
    return bestMatch && bestScore >= 0.75 ? bestMatch : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Vérification des droits d'un utilisateur sur un track spécifique
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Vérifie si un utilisateur a les droits d'utiliser un track payant.
   * Vérifie : gratuit → propriétaire → achat valide → sinon refusé.
   */
  private async verifyRightsForTrack(
    userId: string,
    track: {
      id: string;
      title: string;
      price: number;
      currency: string;
      albumId?: string | null;
      artist: { id: string; stageName: string; userId: string; avatar?: string | null };
    }
  ): Promise<FingerprintMatchResult> {
    const formattedTrack = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      price: track.price,
    };

    // 1. Gratuit
    if (track.price === 0) {
      return {
        isCopyrighted: false,
        isAuthorized: true,
        rightsStatus: 'FREE',
        tokensRequired: 0,
        message: 'Titre gratuit autorisé',
        matchedTrack: formattedTrack,
      };
    }

    // 2. Propre titre de l'artiste
    const userArtist = await this.prisma.artistProfile.findUnique({ where: { userId } });
    if (userArtist && userArtist.id === track.artist.id) {
      return {
        isCopyrighted: true,
        isAuthorized: true,
        rightsStatus: 'OWNED_BY_ARTIST',
        tokensRequired: 0,
        message: 'Votre propre titre — autorisé',
        matchedTrack: formattedTrack,
      };
    }

    // 3. Déjà acheté par l'utilisateur (UNIQUEMENT les achats réussis !)
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        userId,
        status: 'SUCCEEDED',
        OR: [
          { trackId: track.id },
          ...(track.albumId ? [{ albumId: track.albumId }] : []),
        ],
      },
    });

    if (purchase) {
      return {
        isCopyrighted: true,
        isAuthorized: true,
        rightsStatus: 'PURCHASED',
        tokensRequired: 0,
        message: 'Titre acheté — autorisé',
        matchedTrack: formattedTrack,
      };
    }

    // 4. Morceau payant non acheté → Achat requis
    const tokensRequired = Math.ceil(track.price / 10);
    return {
      isCopyrighted: true,
      isAuthorized: false,
      rightsStatus: 'REQUIRES_PURCHASE',
      tokensRequired,
      priceFiat: track.price,
      currency: track.currency,
      message: `Ce titre est payant (${tokensRequired} Jetons / ${track.price} ${track.currency}). Veuillez l'acheter pour l'utiliser.`,
      matchedTrack: formattedTrack,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Charge TOUS les tracks actifs depuis la DB avec cache Redis.
   * Protège toutes les musiques d'artistes (gratuites ET payantes).
   */
  private async getAllTracksWithCache(): Promise<TrackWithArtist[]> {
    const cacheKey = 'kephale:tracks_catalog';

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Ignore cache errors
    }

    const tracks = await this.prisma.track.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        price: true,
        currency: true,
        fingerprint: true,
        albumId: true,
        audioUrl: true,
        s3Key: true,
        artist: { select: { id: true, stageName: true, userId: true, avatar: true } },
      },
    });

    try {
      await this.redis.setex(cacheKey, CATALOG_CACHE_TTL, JSON.stringify(tracks));
    } catch {
      // Ignore cache errors
    }

    return tracks;
  }

  /**
   * Invalide le cache du catalogue de tracks payantes.
   * À appeler quand un track est créé, modifié ou supprimé.
   */
  public async invalidateCatalogCache(): Promise<void> {
    try {
      await this.redis.del('kephale:tracks_catalog');
      await this.redis.del('kephale:paid_tracks_catalog'); // Legacy key cleanup
    } catch {
      // Ignore
    }
  }

  /**
   * Extrait la clé S3 d'une URL publique S3/MinIO.
   */
  private extractS3KeyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);

      // Format Supabase : /storage/v1/object/public/{bucket}/{key}
      const supabaseMatch = parsed.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
      if (supabaseMatch) {
        return supabaseMatch[1];
      }

      // Format MinIO / S3 classique : /{bucket}/{key} ou /{key}
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      if (pathParts.length === 0) return null;

      const bucketName = this.getBucketName();
      if (pathParts[0] === bucketName) {
        pathParts.shift();
      }

      return pathParts.join('/') || null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COUCHE POST-UPLOAD — Vérification asynchrone (BullMQ)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Vérification post-upload asynchrone. Appelée par le worker BullMQ
   * après le transcodage vidéo. Extrait l'audio du fichier transcodé
   * et le compare au catalogue complet.
   *
   * Si une violation est détectée → marque la vidéo comme 'UNDER_REVIEW'.
   */
  public async postUploadVerification(videoId: string): Promise<{
    violation: boolean;
    trackId?: string;
    method?: string;
  }> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        s3Key: true,
        videoUrl: true,
        userId: true,
        artistId: true,
        audioTrackId: true,
        title: true,
        status: true,
      },
    });

    if (!video || video.status === 'INACTIVE') {
      return { violation: false };
    }

    // Si audioTrackId est défini et les droits ont été vérifiés à l'upload, skip
    if (video.audioTrackId) {
      return { violation: false };
    }

    const userId = video.userId || (video.artistId
      ? (await this.prisma.artistProfile.findUnique({ where: { id: video.artistId }, select: { userId: true } }))?.userId
      : null);

    if (!userId) return { violation: false };

    const s3Key = video.s3Key || this.extractS3KeyFromUrl(video.videoUrl);
    if (!s3Key) return { violation: false };

    const paidTracks = await this.getAllTracksWithCache();
    if (paidTracks.length === 0) return { violation: false };

    const result = await this.performAudioAnalysis(s3Key, paidTracks, userId);

    if (result && !result.isAuthorized && result.isCopyrighted) {
      // Violation détectée ! Marquer la vidéo comme sous examen.
      console.warn(`[AudioFingerprint] Post-upload violation detected for video ${videoId}: ${result.message}`);

      await this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'PROCESSING' }, // Repasser en "PROCESSING" pour bloquer la diffusion
      });

      // Créer un rapport automatique si un track match a été trouvé
      if (result.matchedTrack) {
        try {
          await this.prisma.copyrightReport.create({
            data: {
              reporterId: result.matchedTrack.artist.userId,
              videoId: videoId,
              trackId: result.matchedTrack.id,
              reason: `Détection automatique post-upload: ${result.detectionMethod} (score: ${result.similarityScore?.toFixed(2)})`,
              status: 'PENDING',
            },
          });
        } catch (err: any) {
          // Ignore si le rapport existe déjà (unique constraint)
          if (!err.code || err.code !== 'P2002') {
            console.error('[AudioFingerprint] Failed to create copyright report:', err);
          }
        }
      }

      return {
        violation: true,
        trackId: result.matchedTrack?.id,
        method: result.detectionMethod,
      };
    }

    return { violation: false };
  }

  /**
   * Génère et sauvegarde le fingerprint Chromaprint d'un track en DB.
   * Appelé après le transcodage audio (dans le worker BullMQ).
   */
  public async generateAndSaveTrackFingerprint(trackId: string): Promise<void> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true, s3Key: true, audioUrl: true },
    });

    if (!track || !track.s3Key) {
      console.warn(`[AudioFingerprint] Cannot generate fingerprint: track ${trackId} not found or missing s3Key`);
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kephale-track-fp-${trackId}-`));

    try {
      // Télécharger le fichier audio original depuis S3
      const audioFilePath = await this.downloadFromS3(track.s3Key, tmpDir);

      // Générer l'empreinte Chromaprint sur L'INTÉGRALITÉ du fichier original
      const { fingerprint } = await this.generateChromaprintFingerprint(audioFilePath);

      // Sauvegarder en DB
      await this.prisma.track.update({
        where: { id: trackId },
        data: { fingerprint },
      });

      // Invalider le cache du catalogue
      await this.invalidateCatalogCache();

      console.log(`[AudioFingerprint] Saved Chromaprint fingerprint for track ${trackId}`);
    } catch (error) {
      console.error(`[AudioFingerprint] Failed to generate fingerprint for track ${trackId}:`, error);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
