import { prisma } from '@kephale/database';
import { s3Client, BUCKET_NAME } from '../lib/s3.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import os from 'os';

// Configure fluent-ffmpeg to use the static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as any);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path as any);
}

export async function processAudioTranscoding(trackId: string) {
  console.log(`[FFmpeg] Starting transcoding for track ${trackId}`);
  
  const track = await prisma.track.findUnique({ where: { id: trackId } });
  if (!track || !track.s3Key) {
    throw new Error(`Track ${trackId} not found or missing s3Key`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `kephale-transcode-${trackId}-`));
  const originalFilePath = path.join(tmpDir, 'original_audio');
  const hlsDir = path.join(tmpDir, 'hls');
  fs.mkdirSync(hlsDir);

  try {
    // 1. Download original file from MinIO
    console.log(`[FFmpeg] Downloading ${track.s3Key} from MinIO...`);
    const { Body } = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: track.s3Key,
    }));
    
    if (!Body) throw new Error('Failed to download file stream from MinIO');
    
    await pipeline(Body as any, fs.createWriteStream(originalFilePath));
    
    // 2. Get duration via FFmpeg (ffprobe)
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(originalFilePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ? Math.round(metadata.format.duration) : 0);
      });
    });

    console.log(`[FFmpeg] Extracted duration: ${duration}s`);

    // 3. Transcode to HLS
    console.log(`[FFmpeg] Transcoding to HLS...`);
    const masterPlaylist = 'master.m3u8';
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(originalFilePath)
        .outputOptions([
          '-c:a aac',
          '-b:a 128k', // 128kbps for now, can add multiple bitrates later
          '-f hls',
          '-hls_time 10', // 10 second segments
          '-hls_list_size 0', // Keep all segments in the playlist
          `-hls_segment_filename ${path.join(hlsDir, 'segment_%03d.ts')}`
        ])
        .output(path.join(hlsDir, masterPlaylist))
        .on('end', () => {
          console.log('[FFmpeg] Transcoding finished');
          resolve();
        })
        .on('error', (err) => {
          console.error('[FFmpeg] Transcoding error', err);
          reject(err);
        })
        .run();
    });

    // 4. Upload HLS files to MinIO
    const hlsFiles = fs.readdirSync(hlsDir);
    const s3Prefix = `tracks/${trackId}/hls`;
    
    console.log(`[FFmpeg] Uploading ${hlsFiles.length} HLS segments to MinIO...`);
    
    for (const file of hlsFiles) {
      const filePath = path.join(hlsDir, file);
      const fileStream = fs.createReadStream(filePath);
      
      const contentType = file.endsWith('.m3u8') 
        ? 'application/vnd.apple.mpegurl' 
        : 'video/MP2T';

      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${s3Prefix}/${file}`,
        Body: fileStream,
        ContentType: contentType,
        ACL: 'public-read' // Make stream publicly accessible
      }));
    }

    // 5. Update Track in DB
    const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    // Format S3 URL (assuming path style)
    const audioUrl = `${s3Endpoint}/${BUCKET_NAME}/${s3Prefix}/${masterPlaylist}`;

    await prisma.track.update({
      where: { id: trackId },
      data: {
        audioUrl,
        duration,
        status: 'ACTIVE',
      },
    });

    console.log(`[FFmpeg] Successfully processed track ${trackId}`);
  } catch (error) {
    console.error(`[FFmpeg] Error processing track ${trackId}:`, error);
    
    await prisma.track.update({
      where: { id: trackId },
      data: { status: 'INACTIVE' },
    });
    
    throw error;
  } finally {
    // Cleanup temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
