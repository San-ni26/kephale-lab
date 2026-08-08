import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { pipeline } from 'stream/promises';
import dotenv from 'dotenv';

dotenv.config();
const require = createRequire(import.meta.url);
const audiomatcher = require('./src/audio-fingerprint/cpp-matcher/build/Release/audiomatcher.node');
const execFileAsync = promisify(execFile);

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

const s3 = new S3Client(S3_CONFIG);
const prisma = new PrismaClient();

async function extractPCM(filePath, pitchRatio = 1.0) {
    const tmpPath = path.join(os.tmpdir(), `audio-${Date.now()}-${Math.random()}.raw`);
    
    // Si pitchRatio = 1.1, la fréquence d'échantillonnage de ffmpeg simule un pitch shift
    const sampleRate = Math.round(11025 * pitchRatio);
    
    await execFileAsync('ffmpeg', [
        '-i', filePath, 
        '-f', 'f32le', 
        '-acodec', 'pcm_f32le', 
        '-ac', '1', 
        '-ar', sampleRate.toString(), // Extract at modified sample rate to shift pitch
        '-y', tmpPath
    ], { timeout: 60000 });
    
    const buffer = fs.readFileSync(tmpPath);
    const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    fs.unlinkSync(tmpPath);
    return float32Array;
}

function compareConstellations(fp1, fp2) {
    if (!fp1 || !fp2 || fp1.length === 0 || fp2.length === 0) return 0;
    
    const map = new Map();
    for (let i = 0; i < fp2.length; i += 2) {
        const hash = fp2[i];
        const t = fp2[i+1];
        if (!map.has(hash)) map.set(hash, []);
        map.get(hash).push(t);
    }
    
    const offsetCounts = new Map();
    let maxCount = 0;
    
    for (let i = 0; i < fp1.length; i += 2) {
        const hash = fp1[i];
        const t1 = fp1[i+1];
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

async function downloadFromS3(s3Key, localPath) {
    const cleanKey = s3Key.startsWith(`${S3_BUCKET}/`) 
      ? s3Key.replace(`${S3_BUCKET}/`, '') 
      : s3Key;
      
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: cleanKey
    });
    const { Body } = await s3.send(command);
    await pipeline(Body, fs.createWriteStream(localPath));
}

async function main() {
    const reelPath = process.argv[2];
    if (!reelPath) {
        console.error("Veuillez fournir le chemin vers le reel");
        process.exit(1);
    }
    
    console.log("Extraction PCM du Reel...");
    const reelPCM = await extractPCM(reelPath);
    console.log(`Génération Hashes du Reel...`);
    const reelHashes = audiomatcher.generateHashes(reelPCM);
    console.log(`Hashes vidéo générés: ${reelHashes.length / 2} pics combinatoires\n`);
    
    const tracks = await prisma.track.findMany({
        where: { title: "ESSAIE JÉSUS" }
    });
    
    for (const track of tracks) {
        console.log(`Test: ${track.title}...`);
        const tmpPath = path.join(os.tmpdir(), `${track.id}.mp3`);
        const s3Key = track.s3Key || track.audioUrl;
        await downloadFromS3(s3Key, tmpPath);
        
        const trackPCM = await extractPCM(tmpPath, 1.0);
        const trackHashes = audiomatcher.generateHashes(trackPCM);
        
        // Tester plusieurs vitesses du Reel
        const pitches = [0.85, 0.90, 0.95, 1.0, 1.05, 1.10, 1.15, 1.20, 1.25];
        for (const p of pitches) {
            const reelPCMPitch = await extractPCM(reelPath, p);
            const reelHashesPitch = audiomatcher.generateHashes(reelPCMPitch);
            const score = compareConstellations(reelHashesPitch, trackHashes);
            const isMatch = score >= 5000 ? '🚨 MATCH FORT!' : '❌ Bruit';
            console.log(`  -> Pitch x${p.toFixed(2)} | Score: ${score.toString().padStart(5, ' ')} pics alignés | ${isMatch}`);
        }
        
        fs.unlinkSync(tmpPath);
    }
    await prisma.$disconnect();
}

main().catch(console.error);
