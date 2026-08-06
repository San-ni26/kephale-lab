import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function debugMatch() {
  const videoPath = '/Users/paulkone/Desktop/app/app-kephale/v1c044g50000d9d9777og65t43d3dhe0.MP4';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-audio-'));

  try {
    const tracks = await prisma.track.findMany({
      where: { title: { contains: 'ESSAYE', mode: 'insensitive' } },
      select: { id: true, title: true, price: true, s3Key: true, fingerprint: true },
    });

    console.log('📌 Tracks trouvés pour "ESSAYÉ" dans la BDD:', tracks.length);

    console.log('\n--- 1. Analyse Audio de la Vidéo ---');
    const videoAudio = await AudioFingerprintService.extractAudioSegment(videoPath, tmpDir, 0, 20);
    const videoFP = await AudioFingerprintService.generateChromaprintFingerprint(videoAudio);
    console.log('Fingerprint de la vidéo MP4:');
    console.log('  Type:', videoFP.fingerprint.startsWith('fallback_') ? 'FALLBACK' : 'CHROMAPRINT');
    console.log('  Valeur:', videoFP.fingerprint.substring(0, 60) + '...');

    for (const track of tracks) {
      console.log(`\n--- 2. Analyse du Track BDD "${track.title}" (Prix: ${track.price}) ---`);
      console.log('  S3Key:', track.s3Key);
      console.log('  Fingerprint en BDD actuel:', track.fingerprint);

      if (track.s3Key) {
        console.log('  Téléchargement du fichier audio S3...');
        const localTrackAudio = await AudioFingerprintService.downloadFromS3(track.s3Key, tmpDir);

        console.log('  Génération empreinte Chromaprint pour le track S3...');
        const trackFP = await AudioFingerprintService.generateChromaprintFingerprint(localTrackAudio);
        console.log('  Fingerprint généré pour le track S3:');
        console.log('    Type:', trackFP.fingerprint.startsWith('fallback_') ? 'FALLBACK' : 'CHROMAPRINT');
        console.log('    Valeur:', trackFP.fingerprint.substring(0, 60) + '...');

        // Comparer l'empreinte vidéo avec l'empreinte track S3
        const score = AudioFingerprintService.compareFingerprints(videoFP.fingerprint, trackFP.fingerprint);
        console.log(`  🔥 SCORE DE CORRESPONDANCE CHROMAPRINT: ${(score * 100).toFixed(2)}%`);
      }
    }
  } catch (err) {
    console.error('❌ Erreur de débogage:', err);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

debugMatch();
