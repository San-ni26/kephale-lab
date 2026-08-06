import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';

/**
 * Script de migration / backfill :
 * Régénère toutes les empreintes Chromaprint au nouveau format brut `-raw` (liste d'entiers 32-bit séparés par virgules)
 * pour l'ensemble des morceaux enregistrés dans la base de données.
 *
 * Usage : npx tsx src/scripts/migrate-fingerprints.ts
 */
async function migrateTrackFingerprints() {
  console.log('🚀 Démarrage de la migration/backfill des empreintes Chromaprint (-raw)...\n');

  const tracks = await prisma.track.findMany({
    where: {
      s3Key: { not: null },
    },
    select: {
      id: true,
      title: true,
      price: true,
      s3Key: true,
      fingerprint: true,
      artist: { select: { stageName: true } },
    },
  });

  console.log(`📌 ${tracks.length} morceaux avec s3Key trouvés dans la base de données.\n`);

  let successCount = 0;
  let failureCount = 0;
  const migratedTracks: { id: string; title: string; fpLength: number; fpSnippet: string }[] = [];

  for (const track of tracks) {
    const artistName = track.artist?.stageName || 'Artiste Inconnu';
    console.log(`🔍 Régénération pour : "${track.title}" (${artistName}) [ID: ${track.id}]...`);

    try {
      await AudioFingerprintService.generateAndSaveTrackFingerprint(track.id);

      const updatedTrack = await prisma.track.findUnique({
        where: { id: track.id },
        select: { fingerprint: true },
      });

      const fp = updatedTrack?.fingerprint || '';
      const isRawFormat = !fp.startsWith('fallback_') && fp.includes(',');

      console.log(`  ✅ Empreinte régénérée avec succès !`);
      console.log(`     Format : ${isRawFormat ? 'CHROMAPRINT RAW (entiers uint32)' : 'FALLBACK/AUTRE'}`);
      console.log(`     Longueur : ${fp.length} caractères`);
      console.log(`     Aperçu : "${fp.substring(0, 50)}..."\n`);

      migratedTracks.push({
        id: track.id,
        title: track.title,
        fpLength: fp.length,
        fpSnippet: fp.substring(0, 45) + '...',
      });

      successCount++;
    } catch (err: any) {
      console.error(`  ❌ Échec de la régénération pour "${track.title}":`, err?.message || err);
      failureCount++;
    }
  }

  console.log('🔄 Invalidation du cache Redis du catalogue...');
  try {
    await AudioFingerprintService.invalidateCatalogCache();
    console.log('  ✅ Cache Redis invalidé avec succès.\n');
  } catch (err: any) {
    console.warn('  ⚠️ Avertissement invalidation cache Redis:', err?.message || err);
  }

  console.log('====================================================');
  console.log('🎉 RÉSULTAT DU BATCH DE MIGRATION CHROMAPRINT (-raw) :');
  console.log(`   - Morceaux traités avec succès : ${successCount}`);
  console.log(`   - Échecs : ${failureCount}`);
  console.log('====================================================\n');
}

migrateTrackFingerprints()
  .catch((err) => {
    console.error('❌ Erreur fatale durant le script de migration:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
