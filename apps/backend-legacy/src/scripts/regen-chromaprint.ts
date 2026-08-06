import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function regenChromaprint() {
  console.log('🚀 Régénération des empreintes Chromaprint AQAA pour tous les tracks BDD...\n');

  const tracks = await prisma.track.findMany({
    select: { id: true, title: true, s3Key: true, price: true },
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'regen-chroma-'));

  try {
    for (const track of tracks) {
      if (!track.s3Key) continue;
      console.log(`🔍 Traitement de "${track.title}" (${track.id})...`);

      const localAudio = await AudioFingerprintService.downloadFromS3(track.s3Key, tmpDir);
      const segment = await AudioFingerprintService.extractAudioSegment(localAudio, tmpDir, 0, 20);
      const fpResult = await AudioFingerprintService.generateChromaprintFingerprint(segment);

      await prisma.track.update({
        where: { id: track.id },
        data: { fingerprint: fpResult.fingerprint },
      });

      console.log(`  ✅ Empreinte Chromaprint enregistrée: "${fpResult.fingerprint.substring(0, 45)}..."`);
    }

    await AudioFingerprintService.invalidateCatalogCache();
    console.log('\n🎉 Tout le catalogue a été mis à jour avec des empreintes Chromaprint AQAA réelles !');

  } catch (err) {
    console.error('❌ Erreur régénération Chromaprint:', err);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

regenChromaprint();
