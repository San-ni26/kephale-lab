import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as any);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path as any);

/**
 * Service de transcodage vidéo.
 *
 * Compresse les Reels (SHORT) en :
 *   - 720p max, H.264, CRF 26 (~2 Mbps)
 *   - AAC 128k mono
 *   - -movflags faststart (lecture démarrée avant la fin du téléchargement)
 *
 * Gain attendu : -63 à -82% de bande passante selon la qualité originale.
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);
  // Singleton S3Client — instancié une fois, évite la recréation coûteuse à chaque appel
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaClient,
  ) {
    this.bucketName = (
      this.configService.get<string>('S3_BUCKET_NAME') ||
      process.env.S3_BUCKET_NAME ||
      'kephale-media'
    );
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || process.env.AWS_REGION || 'us-east-1',
      endpoint:
        this.configService.get<string>('S3_ENDPOINT') ||
        process.env.S3_ENDPOINT ||
        'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3',
      credentials: {
        accessKeyId:
          this.configService.get<string>('AWS_ACCESS_KEY_ID') || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ||
          process.env.AWS_SECRET_ACCESS_KEY ||
          '',
      },
      forcePathStyle: true,
    });
  }

  private getBucketName(): string {
    return this.bucketName;
  }

  private getS3Client(): S3Client {
    return this.s3Client;
  }

  /**
   * Télécharge un fichier S3 dans un répertoire temporaire.
   */
  private async downloadFromS3(s3Key: string, tmpDir: string): Promise<string> {
    const bucketName = this.getBucketName();
    const cleanKey = s3Key.startsWith(`${bucketName}/`)
      ? s3Key.replace(`${bucketName}/`, '')
      : s3Key;
    const ext = path.extname(cleanKey) || '.mp4';
    const localPath = path.join(tmpDir, `original${ext}`);

    const client = this.getS3Client();
    const { Body } = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: cleanKey })
    );

    if (!Body) throw new Error(`S3 download failed for key: ${cleanKey}`);
    await pipeline(Body as any, fs.createWriteStream(localPath));
    return localPath;
  }

  /**
   * Upload un fichier vers S3 et retourne la clé et l'URL publique.
   */
  private async uploadToS3(
    localPath: string,
    s3Key: string
  ): Promise<{ key: string; publicUrl: string }> {
    const bucketName = this.getBucketName();
    const client = this.getS3Client();
    const fileStats = fs.statSync(localPath);

    // Stream au lieu de readFileSync — évite de charger jusqu'à 500 MB en RAM
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fs.createReadStream(localPath),
        ContentLength: fileStats.size,
        ContentType: 'video/mp4',
        // ACL publique pour les vidéos (nécessaire pour la lecture directe)
        ACL: 'public-read' as any,
      })
    );

    const publicBase =
      this.configService.get<string>('S3_BUCKET_PUBLIC_URL') ||
      process.env.S3_BUCKET_PUBLIC_URL ||
      `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/${bucketName}`;

    return {
      key: s3Key,
      publicUrl: `${publicBase}/${s3Key}`,
    };
  }

  /**
   * Transcoode une vidéo avec FFmpeg :
   *   - Résolution max 720p (garde le ratio original)
   *   - H.264 CRF 26 (~2 Mbps) — qualité optimale mobile
   *   - AAC 128k
   *   - -movflags faststart (streaming progressif)
   *
   * @returns Chemin local du fichier transcodé
   */
  private async transcodeVideo(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      // Timeout global : 5 min max (vidéos jusqu'à ~500 Mo)
      const timeoutId = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          reject(new Error('FFmpeg transcode timeout (5min)'));
        }
      }, 5 * 60 * 1000);

      ffmpeg(inputPath)
        // ── Filtre vidéo : limiter à 720p en gardant le ratio ──────────────
        .videoFilter("scale='min(1280,iw)':'-2'") // max 1280px largeur, hauteur auto
        // ── Encodage vidéo H.264 CRF 26 ────────────────────────────────────
        .videoCodec('libx264')
        .outputOptions([
          '-crf', '26',                   // Qualité (18=lossless, 28=bonne qualité mobile)
          '-preset', 'fast',              // Bon équilibre vitesse/taille
          '-profile:v', 'baseline',       // Compatible iOS/Android
          '-level', '3.1',
          '-pix_fmt', 'yuv420p',          // Compatible tous les players
          '-movflags', '+faststart',      // Permet la lecture avant la fin du DL
        ])
        // ── Encodage audio AAC 128k ─────────────────────────────────────────
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioChannels(2)
        // ── Output MP4 ─────────────────────────────────────────────────────
        .format('mp4')
        .output(outputPath)
        .on('start', (cmd) => {
          this.logger.debug(`[Transcode] FFmpeg command: ${cmd}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            this.logger.debug(`[Transcode] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutId);
            resolve();
          }
        })
        .on('error', (err) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timeoutId);
            reject(err);
          }
        })
        .run();
    });
  }

  /**
   * Pipeline complet de transcodage pour une vidéo :
   *   1. Télécharge l'original depuis S3
   *   2. Transcoode en 720p CRF 26
   *   3. Upload le fichier compressé sur S3
   *   4. Met à jour videoUrl en DB
   *   5. Optionnellement : supprime l'original S3 pour économiser du stockage
   */
  public async transcodeVideoById(videoId: string): Promise<{
    success: boolean;
    originalSize?: number;
    compressedSize?: number;
    compressionRatio?: number;
  }> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, s3Key: true, videoUrl: true, status: true },
    });

    if (!video) {
      this.logger.warn(`[Transcode] Video ${videoId} not found, skipping.`);
      return { success: false };
    }

    if (!video.s3Key) {
      this.logger.warn(`[Transcode] Video ${videoId} has no s3Key, skipping.`);
      return { success: false };
    }

    // Éviter de retranscoder une vidéo déjà compressée (clé contient "_720p")
    if (video.s3Key.includes('_720p')) {
      this.logger.log(`[Transcode] Video ${videoId} already transcoded, skipping.`);
      return { success: true };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kephale-transcode-${videoId}-`));

    try {
      this.logger.log(`[Transcode] Starting transcode for video ${videoId}`);

      // 1. Téléchargement
      const originalPath = await this.downloadFromS3(video.s3Key, tmpDir);
      const originalSize = fs.statSync(originalPath).size;
      this.logger.log(
        `[Transcode] Downloaded ${(originalSize / (1024 * 1024)).toFixed(1)} MB for video ${videoId}`
      );

      // 2. Transcodage
      const outputPath = path.join(tmpDir, 'compressed_720p.mp4');
      await this.transcodeVideo(originalPath, outputPath);

      const compressedSize = fs.statSync(outputPath).size;
      const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);
      this.logger.log(
        `[Transcode] Compressed ${(compressedSize / (1024 * 1024)).toFixed(1)} MB ` +
        `(${compressionRatio}% reduction) for video ${videoId}`
      );

      // 3. Upload de la version compressée
      const bucketName = this.getBucketName();
      const originalKey = video.s3Key.startsWith(`${bucketName}/`)
        ? video.s3Key.replace(`${bucketName}/`, '')
        : video.s3Key;
      const compressedKey = originalKey.replace(/\.[^.]+$/, '') + '_720p.mp4';

      const { publicUrl } = await this.uploadToS3(outputPath, compressedKey);
      this.logger.log(`[Transcode] Uploaded compressed video to S3: ${compressedKey}`);

      // 4. Mise à jour DB
      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          videoUrl: publicUrl,
          s3Key: compressedKey,
        },
      });

      this.logger.log(`[Transcode] ✅ Video ${videoId} transcoded successfully (-${compressionRatio}%)`);

      return { success: true, originalSize, compressedSize, compressionRatio };
    } catch (error: any) {
      this.logger.error(`[Transcode] ❌ Failed to transcode video ${videoId}: ${error.message}`);
      throw error;
    } finally {
      // Nettoyage des fichiers temporaires
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  /**
   * Retranscoder toutes les vidéos existantes (migration batch).
   * Utilise une pagination par curseur pour éviter de charger tous les IDs en mémoire.
   *
   * @param batchSize Nombre de vidéos traitées en parallèle (défaut: 2)
   * @param onlyShorts Si true, ne traite que les SHORT (Reels) — défaut: true
   */
  public async transcodeExistingVideos(
    batchSize = 2,
    onlyShorts = true
  ): Promise<{ processed: number; failed: number; skipped: number }> {
    const baseWhere: any = {
      status: 'ACTIVE',
      s3Key: { not: null },
      NOT: { s3Key: { contains: '_720p' } }, // Ne pas re-transcoder les déjà compressés
    };
    if (onlyShorts) baseWhere.type = 'SHORT';

    let processed = 0;
    let failed = 0;
    let skipped = 0;
    let cursor: string | undefined = undefined;
    let totalFound = 0;

    // Pagination par curseur — évite de charger tous les IDs en mémoire
    do {
      const batch: Array<{ id: string }> = await this.prisma.video.findMany({
        where: baseWhere,
        select: { id: true },
        take: batchSize,
        orderBy: { id: 'asc' },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;
      totalFound += batch.length;
      cursor = batch[batch.length - 1].id;

      const results = await Promise.allSettled(
        batch.map((v: { id: string }) => this.transcodeVideoById(v.id))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) processed++;
          else skipped++;
        } else {
          failed++;
        }
      }

      this.logger.log(
        `[Transcode Batch] Cursor batch done: ✅ ${processed} | ❌ ${failed} | ⏭ ${skipped} (total found: ${totalFound})`
      );
    } while (true);

    this.logger.log(
      `[Transcode Batch] ✅ Done! Processed: ${processed}, Failed: ${failed}, Skipped: ${skipped}`
    );

    return { processed, failed, skipped };
  }
}
