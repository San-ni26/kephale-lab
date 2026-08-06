import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';

/**
 * Script de migration : Génère les empreintes acoustiques Chromaprint
 * pour tous les tracks existants qui n'en ont pas encore.
 *
 * Usage : npx tsx src/scripts/generate-fingerprints.ts
 *
 * Prérequis : fpcalc doit être installé sur le système
 *   - macOS : brew install chromaprint
 *   - Linux : apt install libchromaprint-tools
 */
async function generateFingerprintsForExistingTracks() {
  console.log('🚀 Génération des empreintes acoustiques Chromaprint pour les tracks existants...\n');

  const tracks = await prisma.track.findMany({
    where: {
      s3Key: { not: null },
      status: 'ACTIVE',
      OR: [
        { fingerprint: null },
        { fingerprint: '' },
      ],
    },
    select: {
      id: true,
      title: true,
      price: true,
      s3Key: true,
      artist: { select: { stageName: true } },
    },
  });

  console.log(`📌 ${tracks.length} tracks sans empreinte acoustique trouvés.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const track of tracks) {
    const artistName = track.artist?.stageName || 'Artiste';
    const priceLabel = track.price > 0 ? `PAYANT (${track.price} FCFA)` : 'GRATUIT';

    try {
      console.log(`🔍 Analyse de "${track.title}" (${artistName}) [${priceLabel}]...`);

      await AudioFingerprintService.generateAndSaveTrackFingerprint(track.id);

      console.log(`  ✅ Empreinte Chromaprint enregistrée avec succès.`);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Erreur pour "${track.title}":`, err instanceof Error ? err.message : err);
      errorCount++;
    }
  }

  console.log(`\n🎉 Terminé ! ${successCount} empreintes générées, ${errorCount} erreurs.`);
}

generateFingerprintsForExistingTracks()
  .catch((err) => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
