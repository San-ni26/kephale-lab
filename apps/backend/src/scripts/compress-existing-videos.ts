#!/usr/bin/env ts-node
/**
 * Script de migration batch — Compression des vidéos Reels existantes
 *
 * Recompresse tous les Reels (SHORT) actifs en 720p CRF 26 pour réduire
 * la consommation de données mobiles des utilisateurs.
 *
 * Usage :
 *   cd apps/backend
 *   npx ts-node src/scripts/compress-existing-videos.ts
 *
 * Options d'environnement :
 *   BATCH_SIZE=2        Nombre de vidéos traitées en parallèle (défaut: 2)
 *   ONLY_SHORTS=true    Ne traiter que les Reels SHORT (défaut: true)
 *   DRY_RUN=true        Simuler sans modifier quoi que ce soit (défaut: false)
 */

import { PrismaClient } from '@prisma/client';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';
import * as dotenv from 'dotenv';

dotenv.config();

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as any);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path as any);

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '2', 10);
const ONLY_SHORTS = process.env.ONLY_SHORTS !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';

const BUCKET_NAME =
  process.env.S3_BUCKET_NAME ||
  process.env.AWS_S3_BUCKET ||
  'kephale-media';

const PUBLIC_BASE =
  process.env.S3_BUCKET_PUBLIC_URL ||
  `https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/${BUCKET_NAME}`;

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || 'https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/s3',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  });
}

async function downloadFromS3(s3Key: string, tmpDir: string): Promise<string> {
  const cleanKey = s3Key.startsWith(`${BUCKET_NAME}/`)
    ? s3Key.replace(`${BUCKET_NAME}/`, '')
    : s3Key;
  const ext = path.extname(cleanKey) || '.mp4';
  const localPath = path.join(tmpDir, `original${ext}`);

  const client = getS3Client();
  const { Body } = await client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: cleanKey })
  );

  if (!Body) throw new Error(`S3 download failed for: ${cleanKey}`);
  await pipeline(Body as any, fs.createWriteStream(localPath));
  return localPath;
}

async function uploadToS3(localPath: string, s3Key: string): Promise<string> {
  const client = getS3Client();
  const fileBuffer = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: 'video/mp4',
      ACL: 'public-read' as any,
    })
  );

  return `${PUBLIC_BASE}/${s3Key}`;
}

async function transcodeVideo(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let isSettled = false;

    const timeoutId = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        reject(new Error('FFmpeg timeout (5min)'));
      }
    }, 5 * 60 * 1000);

    ffmpeg(inputPath)
      .videoFilter("scale='min(1280,iw)':'-2'")
      .videoCodec('libx264')
      .outputOptions([
        '-crf', '26',
        '-preset', 'fast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioChannels(2)
      .format('mp4')
      .output(outputPath)
      .on('end', () => {
        if (!isSettled) { isSettled = true; clearTimeout(timeoutId); resolve(); }
      })
      .on('error', (err) => {
        if (!isSettled) { isSettled = true; clearTimeout(timeoutId); reject(err); }
      })
      .run();
  });
}

async function processVideo(
  prisma: PrismaClient,
  videoId: string,
  videoS3Key: string
): Promise<{ success: boolean; compressionRatio?: number }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kephale-migrate-${videoId.slice(0, 8)}-`));

  try {
    console.log(`  📥 Downloading ${videoId}...`);
    const originalPath = await downloadFromS3(videoS3Key, tmpDir);
    const originalSize = fs.statSync(originalPath).size;

    const outputPath = path.join(tmpDir, 'compressed_720p.mp4');
    console.log(`  🎬 Transcoding ${videoId} (${(originalSize / (1024 * 1024)).toFixed(1)} MB)...`);
    await transcodeVideo(originalPath, outputPath);

    const compressedSize = fs.statSync(outputPath).size;
    const compressionRatio = Math.round((1 - compressedSize / originalSize) * 100);

    const cleanKey = videoS3Key.startsWith(`${BUCKET_NAME}/`)
      ? videoS3Key.replace(`${BUCKET_NAME}/`, '')
      : videoS3Key;
    const compressedKey = cleanKey.replace(/\.[^.]+$/, '') + '_720p.mp4';

    console.log(`  📤 Uploading compressed video (${(compressedSize / (1024 * 1024)).toFixed(1)} MB, -${compressionRatio}%)...`);
    const publicUrl = await uploadToS3(outputPath, compressedKey);

    if (!DRY_RUN) {
      await prisma.video.update({
        where: { id: videoId },
        data: { videoUrl: publicUrl, s3Key: compressedKey },
      });
    }

    console.log(`  ✅ Done: ${videoId} (-${compressionRatio}%)`);
    return { success: true, compressionRatio };
  } catch (err: any) {
    console.error(`  ❌ Failed: ${videoId}: ${err.message}`);
    return { success: false };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Kephale — Migration batch compression vidéo 720p CRF 26');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Batch size   : ${BATCH_SIZE}`);
  console.log(`  Only Shorts  : ${ONLY_SHORTS}`);
  console.log(`  Dry run      : ${DRY_RUN}`);
  console.log('');

  const prisma = new PrismaClient();

  try {
    const where: any = {
      status: 'ACTIVE',
      s3Key: { not: null },
      NOT: { s3Key: { contains: '_720p' } },
    };

    if (ONLY_SHORTS) where.type = 'SHORT';

    const videos = await prisma.video.findMany({
      where,
      select: { id: true, s3Key: true, title: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`  Found ${videos.length} videos to compress\n`);

    if (videos.length === 0) {
      console.log('  Nothing to do!');
      return;
    }

    let processed = 0;
    let failed = 0;
    let totalSaved = 0;

    for (let i = 0; i < videos.length; i += BATCH_SIZE) {
      const batch = videos.slice(i, i + BATCH_SIZE);
      console.log(`\n[${i + 1}–${Math.min(i + BATCH_SIZE, videos.length)}/${videos.length}]`);

      const results = await Promise.allSettled(
        batch.map((v) => processVideo(prisma, v.id, v.s3Key!))
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success) {
          processed++;
        } else {
          failed++;
        }
      }

      console.log(`\n  Progress: ${Math.min(i + BATCH_SIZE, videos.length)}/${videos.length} ✅ ${processed} ❌ ${failed}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Migration terminée !`);
    console.log(`  ✅ Succès  : ${processed}`);
    console.log(`  ❌ Échecs  : ${failed}`);
    if (DRY_RUN) console.log('  ⚠️  Mode DRY RUN — aucune modification en DB');
    console.log('═══════════════════════════════════════════════════════════\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
