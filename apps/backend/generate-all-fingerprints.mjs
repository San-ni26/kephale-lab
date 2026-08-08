#!/usr/bin/env node
/**
 * Script de migration : Génère les empreintes acoustiques Chromaprint
 * pour TOUTES les tracks existantes qui n'en ont pas encore.
 *
 * Usage : node generate-all-fingerprints.mjs
 *
 * Ce script :
 * 1. Récupère toutes les tracks sans empreinte depuis la DB
 * 2. Télécharge chaque fichier audio depuis S3
 * 3. Génère l'empreinte Chromaprint via fpcalc
 * 4. Sauvegarde l'empreinte en base
 * 5. Invalide le cache Redis
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Pool } from 'pg';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import Redis from 'ioredis';

const execFileAsync = promisify(execFile);

// ── Configuration ─────────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL || 
  "postgresql://4858576a80a25e3159340ff76cf3e8f76363e8149cef95a1df00a6dc42a276e0:sk_ahDjO8wl6hWxqSiy4YkY6@pooled.db.prisma.io:5432/postgres?sslmode=require&schema=public&pgbouncer=true&connection_limit=30&pool_timeout=30&connect_timeout=15";

const S3_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '35873bb030c6d7c7c4efec7595f2b985',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '3760bdbbeaf9e9c4a5ed45aa45250b64fc8a17640051149ffa9bff76419603c2',
  },
  forcePathStyle: true,
};

const S3_BUCKET = process.env.S3_BUCKET_NAME || 'kephale-media';
const FPCALC_PATH = process.env.FPCALC_PATH || 'fpcalc';
const AUDIO_SEGMENT_DURATION = 20; // secondes

// ── Télécharger depuis S3 ─────────────────────────────────────────────────────
async function downloadFromS3(s3Key, localPath) {
  const client = new S3Client(S3_CONFIG);
  const cleanKey = s3Key.startsWith(`${S3_BUCKET}/`) 
    ? s3Key.replace(`${S3_BUCKET}/`, '') 
    : s3Key;

  const { Body } = await client.send(new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: cleanKey,
  }));

  if (!Body) throw new Error(`Fichier S3 vide: ${cleanKey}`);
  await pipeline(Body, createWriteStream(localPath));
}

// ── Générer l'empreinte Chromaprint ──────────────────────────────────────────
async function generateFingerprint(audioFilePath) {
  // Essayer d'abord directement sur le fichier
  try {
    const { stdout } = await execFileAsync(FPCALC_PATH, [
      '-raw', '-json', audioFilePath,
    ], { timeout: 180000 }); // 3 minutes timeout pour morceau complet
    const result = JSON.parse(stdout);
    if (result.fingerprint && result.fingerprint.length > 0) {
      return result.fingerprint;
    }
  } catch {}

  // Fallback : extraire avec ffmpeg d'abord
  const tmpDir = path.dirname(audioFilePath);
  const wavPath = path.join(tmpDir, 'segment.wav');

  await execFileAsync('ffmpeg', [
    '-i', audioFilePath,
    '-vn', '-ar', '16000', '-ac', '1',
    '-f', 'wav', '-y', wavPath
  ], { timeout: 180000 });

  const { stdout } = await execFileAsync(FPCALC_PATH, [
    '-raw', '-json', wavPath
  ], { timeout: 180000 });

  const result = JSON.parse(stdout);
  return result.fingerprint;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  🎵 MIGRATION : GÉNÉRATION DES EMPREINTES ACOUSTIQUES KEPHALE   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  let processed = 0, succeeded = 0, failed = 0;

  try {
    // 1. Récupérer toutes les tracks sans empreinte
    const { rows: tracks } = await pool.query(`
      SELECT t.id, t.title, t."s3Key", t."audioUrl", a."stageName"
      FROM tracks t
      JOIN "artist_profiles" a ON t."artistId" = a.id
      WHERE t.status = 'ACTIVE'
        AND (t."s3Key" IS NOT NULL OR t."audioUrl" IS NOT NULL)
      ORDER BY t."createdAt" DESC
    `);

    if (tracks.length === 0) {
      console.log('✅ Toutes les tracks ont déjà une empreinte ! Rien à faire.\n');
      return;
    }

    console.log(`📋 ${tracks.length} track(s) sans empreinte trouvée(s) :\n`);
    tracks.forEach((t, i) => {
      console.log(`   ${i + 1}. "${t.title}" — ${t.stageName}`);
    });
    console.log('');

    // 2. Traiter chaque track
    for (const track of tracks) {
      processed++;
      const prefix = `[${processed}/${tracks.length}]`;
      console.log(`${prefix} 🎵 Traitement de "${track.title}" (${track.stageName})...`);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kephale-fp-${track.id.slice(0, 8)}-`));

      try {
        // Télécharger le fichier audio depuis S3
        const s3Key = track.s3Key || extractS3KeyFromUrl(track.audioUrl);
        if (!s3Key) {
          console.log(`   ⚠️  Aucune clé S3 disponible — skip\n`);
          failed++;
          continue;
        }

        const ext = path.extname(s3Key) || '.audio';
        const localPath = path.join(tmpDir, `audio${ext}`);

        process.stdout.write(`   ⬇️  Téléchargement depuis S3 (${s3Key.split('/').pop()})...`);
        await downloadFromS3(s3Key, localPath);
        const sizeMb = (fs.statSync(localPath).size / (1024 * 1024)).toFixed(1);
        console.log(` ${sizeMb}MB ✅`);

        // Générer l'empreinte
        process.stdout.write(`   🔬 Génération Chromaprint...`);
        const fingerprint = await generateFingerprint(localPath);

        if (!fingerprint || fingerprint.length < 10) {
          throw new Error('Empreinte trop courte ou vide');
        }
        console.log(` ${fingerprint.length} vecteurs ✅`);

        // Sauvegarder en DB
        await pool.query(
          `UPDATE tracks SET fingerprint = $1 WHERE id = $2`,
          [JSON.stringify(fingerprint), track.id]
        );

        console.log(`   💾 Empreinte sauvegardée en base ✅\n`);
        succeeded++;
      } catch (err) {
        console.log(`\n   ❌ Échec : ${err.message}\n`);
        failed++;
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    // 3. Invalider le cache Redis si disponible
    try {
      const REDIS_URL = process.env.REDIS_URL ||
        'rediss://default:gQAAAAAAAfOkAAIgcDJhZDE5NmZkZmYwNjE0NDc3YjBjMWM5ZWMwOGI5ZmM3MA@joint-mammoth-127908.upstash.io:6379';
      
      const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, lazyConnect: true });
      await redis.connect();
      const deleted = await redis.del('fp:catalog:all');
      redis.disconnect();
      if (deleted > 0) {
        console.log('🗑️  Cache Redis catalogue invalidé\n');
      }
    } catch {
      console.log('ℹ️  Cache Redis non disponible (sera invalidé au prochain démarrage)\n');
    }

    // 4. Résumé
    console.log('╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                         RÉSUMÉ FINAL                            ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║  Traitées  : ${String(processed).padEnd(3)}                                              ║`);
    console.log(`║  ✅ Succès : ${String(succeeded).padEnd(3)}                                              ║`);
    console.log(`║  ❌ Échecs : ${String(failed).padEnd(3)}                                              ║`);
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    if (succeeded > 0) {
      console.log('🎉 Les empreintes sont maintenant enregistrées !');
      console.log('   Le système de détection va maintenant bloquer les reels');
      console.log('   qui utilisent ces musiques sans les avoir achetées.\n');
    }

    if (failed > 0) {
      console.log(`⚠️  ${failed} track(s) n'ont pas pu être traitées.`);
      console.log('   Vérifiez que les fichiers S3 sont accessibles et relancez le script.\n');
    }

  } finally {
    await pool.end();
  }
}

function extractS3KeyFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Format Supabase: /storage/v1/object/public/bucket-name/key
    const match = u.pathname.match(/\/storage\/v1\/(?:object\/public|object)\/[^/]+\/(.+)/);
    if (match) return match[1];
    // Format S3 standard
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err);
  process.exit(1);
});
