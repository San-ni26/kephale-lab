/**
 * Script de migration : régénère tous les fingerprints Chromaprint existants.
 *
 * CONTEXTE : les fingerprints stockés avant le fix utilisaient le format base64
 * compressé de Chromaprint (buggé). Le code corrigé utilise `fpcalc -raw`, qui
 * produit un format différent (liste d'entiers séparés par des virgules).
 * Les anciens fingerprints sont donc incompatibles avec le nouveau code de
 * comparaison et doivent être régénérés.
 *
 * USAGE :
 *   npx tsx src/scripts/backfill-fingerprints.ts
 *   npx tsx src/scripts/backfill-fingerprints.ts --dry-run   (liste sans rien modifier)
 *   npx tsx src/scripts/backfill-fingerprints.ts --concurrency=3
 *
 * Le script :
 *   1. Récupère tous les tracks ayant un s3Key valide (avec ou sans fingerprint existant).
 *   2. Régénère le fingerprint de chacun avec le code corrigé (generateAndSaveTrackFingerprint).
 *   3. Traite les tracks par lots (concurrency limitée) pour ne pas surcharger S3/FFmpeg.
 *   4. Logue chaque succès/échec individuellement sans arrêter le batch entier.
 *   5. Invalide le cache Redis du catalogue à la fin.
 *   6. Affiche un résumé final (total / succès / échecs / ignorés).
 */

import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';
import { redis } from '../lib/redis.js';

// ── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_CONCURRENCY = 3; // limite le nombre de téléchargements S3 / appels fpcalc en parallèle
const CATALOG_CACHE_KEY = 'kephale:paid_tracks_catalog';

interface MigrationResult {
  trackId: string;
  title: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  durationMs?: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const concurrency = concurrencyArg
    ? parseInt(concurrencyArg.split('=')[1], 10)
    : DEFAULT_CONCURRENCY;
  return { dryRun, concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : DEFAULT_CONCURRENCY };
}

/**
 * Traite une liste d'éléments avec une concurrence limitée (évite de saturer S3/FFmpeg).
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

async function migrateTrack(track: { id: string; title: string; s3Key: string | null }): Promise<MigrationResult> {
  const start = Date.now();

  if (!track.s3Key) {
    return { trackId: track.id, title: track.title, status: 'skipped', error: 'no s3Key' };
  }

  try {
    await AudioFingerprintService.generateAndSaveTrackFingerprint(track.id);
    return {
      trackId: track.id,
      title: track.title,
      status: 'success',
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    return {
      trackId: track.id,
      title: track.title,
      status: 'failed',
      error: error?.message || String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function main() {
  const { dryRun, concurrency } = parseArgs();

  console.log(`[Backfill] Démarrage — dryRun=${dryRun}, concurrency=${concurrency}`);

  // Récupère tous les tracks ayant un s3Key (peu importe l'état actuel du fingerprint)
  const tracks = await prisma.track.findMany({
    where: {
      s3Key: { not: null },
    },
    select: { id: true, title: true, s3Key: true, fingerprint: true },
  });

  console.log(`[Backfill] ${tracks.length} track(s) trouvé(s) avec un s3Key.`);

  if (dryRun) {
    console.log('[Backfill] --dry-run activé : aucune modification ne sera faite. Liste des tracks concernés :');
    for (const t of tracks) {
      console.log(`  - ${t.id} | "${t.title}" | fingerprint actuel: ${t.fingerprint ? 'présent (à régénérer)' : 'absent'}`);
    }
    return;
  }

  const startedAt = Date.now();

  const results = await processWithConcurrency(tracks, concurrency, async (track, index) => {
    const result = await migrateTrack(track);
    const progress = `[${index + 1}/${tracks.length}]`;

    if (result.status === 'success') {
      console.log(`${progress} ✅ "${result.title}" (${result.trackId}) — régénéré en ${result.durationMs}ms`);
    } else if (result.status === 'skipped') {
      console.log(`${progress} ⏭️  "${result.title}" (${result.trackId}) — ignoré (${result.error})`);
    } else {
      console.error(`${progress} ❌ "${result.title}" (${result.trackId}) — échec: ${result.error}`);
    }

    return result;
  });

  // ── Invalidation du cache Redis du catalogue ──────────────────────────────
  try {
    await redis.del(CATALOG_CACHE_KEY);
    console.log('[Backfill] Cache Redis du catalogue invalidé.');
  } catch (err) {
    console.error('[Backfill] Échec invalidation cache Redis (non bloquant):', err);
  }

  // ── Résumé final ───────────────────────────────────────────────────────────
  const succeeded = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  const skipped = results.filter(r => r.status === 'skipped');
  const totalDurationSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n' + '─'.repeat(60));
  console.log('[Backfill] RÉSUMÉ');
  console.log('─'.repeat(60));
  console.log(`Total traité       : ${tracks.length}`);
  console.log(`Succès             : ${succeeded.length}`);
  console.log(`Échecs             : ${failed.length}`);
  console.log(`Ignorés (pas de s3Key) : ${skipped.length}`);
  console.log(`Durée totale       : ${totalDurationSec}s`);

  if (failed.length > 0) {
    console.log('\nTracks en échec (à réexaminer manuellement) :');
    for (const f of failed) {
      console.log(`  - ${f.trackId} | "${f.title}" | erreur: ${f.error}`);
    }
  }

  console.log('─'.repeat(60));

  if (failed.length > 0) {
    process.exitCode = 1; // signale un échec partiel pour les pipelines CI/CD
  }
}

main()
  .catch((err) => {
    console.error('[Backfill] Erreur fatale:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit().catch(() => {});
  });
