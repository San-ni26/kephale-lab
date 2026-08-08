#!/usr/bin/env node
/**
 * Script de test : Analyse l'empreinte acoustique d'un fichier vidéo
 * et le compare avec le catalogue Kephale en base de données.
 * 
 * Usage (depuis apps/backend) : node test-audio-fp.mjs <chemin-absolu-video>
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const execFileAsync = promisify(execFile);

// ── Configuration ─────────────────────────────────────────────────────────────
const DB_URL = "postgresql://4858576a80a25e3159340ff76cf3e8f76363e8149cef95a1df00a6dc42a276e0:sk_ahDjO8wl6hWxqSiy4YkY6@pooled.db.prisma.io:5432/postgres?sslmode=require&schema=public&pgbouncer=true&connection_limit=30&pool_timeout=30&connect_timeout=15";
const FPCALC_PATH = 'fpcalc';
const CHROMAPRINT_THRESHOLD = 0.75;

// ── Générer l'empreinte Chromaprint ──────────────────────────────────────────
async function generateFingerprint(filePath) {
  console.log(`\n🎵 Génération de l'empreinte Chromaprint...`);
  console.log(`   Fichier : ${path.basename(filePath)}`);

  try {
    const { stdout } = await execFileAsync(FPCALC_PATH, [
      '-raw', '-length', '30', '-json', filePath,
    ], { timeout: 30000 });

    const result = JSON.parse(stdout);
    console.log(`   ✅ Empreinte : ${result.fingerprint.length} vecteurs — durée analysée : ${result.duration?.toFixed(1)}s`);
    return result;
  } catch (err) {
    // Fallback ffmpeg
    console.log(`   ⚠️  Tentative avec extraction ffmpeg...`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kephale-fp-'));
    const audioPath = path.join(tmpDir, 'audio.wav');

    await execFileAsync('ffmpeg', [
      '-i', filePath, '-vn', '-ar', '16000', '-ac', '1',
      '-f', 'wav', '-t', '30', '-y', audioPath
    ], { timeout: 60000 });

    const { stdout } = await execFileAsync(FPCALC_PATH, [
      '-raw', '-json', audioPath
    ], { timeout: 30000 });

    const result = JSON.parse(stdout);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`   ✅ Empreinte via ffmpeg : ${result.fingerprint.length} vecteurs`);
    return result;
  }
}

// ── Comparaison bit à bit des empreintes ─────────────────────────────────────
function compareFingerprints(fp1, fp2) {
  if (!fp1 || !fp2) return 0;
  const arr1 = Array.isArray(fp1) ? fp1 : String(fp1).split(',').map(Number);
  const arr2 = Array.isArray(fp2) ? fp2 : String(fp2).split(',').map(Number);
  const minLen = Math.min(arr1.length, arr2.length);
  if (minLen === 0) return 0;

  let matching = 0, total = 0;
  for (let i = 0; i < minLen; i++) {
    const xor = (arr1[i] >>> 0) ^ (arr2[i] >>> 0);
    let bits = 0, v = xor;
    while (v) { bits += v & 1; v >>>= 1; }
    matching += (32 - bits);
    total += 32;
  }
  return matching / total;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const videoPath = process.argv[2];
  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('❌ Usage : node test-audio-fp.mjs <chemin-absolu-video>');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 TEST ANALYSE EMPREINTE ACOUSTIQUE — STUDIO REEL KEPHALE  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const pool = new Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // ── 1. Catalogue complet ──────────────────────────────────────────────────
    console.log('\n📋 Catalogue des musiques Kephale :');
    const allResult = await pool.query(`
      SELECT t.id, t.title, t.price, t.currency,
        a."stageName",
        CASE WHEN t.fingerprint IS NOT NULL AND length(t.fingerprint::text) > 10 
             THEN true ELSE false END as "hasFingerprint"
      FROM tracks t
      JOIN "artist_profiles" a ON t."artistId" = a.id
      ORDER BY t.price DESC
    `);

    if (allResult.rows.length === 0) {
      console.log('   ⚠️  Aucune track dans la base de données');
    } else {
      allResult.rows.forEach(t => {
        const fp = t.hasFingerprint ? '🎵 empreinte ✅' : '❌ sans empreinte';
        const price = t.price === 0 ? '🆓 Gratuit' : `💰 ${t.price} ${t.currency}`;
        console.log(`   • "${t.title}" — ${t.stageName} — ${price} — ${fp}`);
      });
    }

    // ── 2. Générer empreinte de la vidéo ──────────────────────────────────────
    const videoFP = await generateFingerprint(videoPath);

    // ── 3. Récupérer les tracks avec empreintes ───────────────────────────────
    const catalogResult = await pool.query(`
      SELECT t.id, t.title, t.price, t.currency, t.fingerprint, t."albumId",
        a.id as "artistId", a."stageName", a.avatar
      FROM tracks t
      JOIN "artist_profiles" a ON t."artistId" = a.id
      WHERE t.fingerprint IS NOT NULL AND length(t.fingerprint::text) > 10
    `);

    const catalogTracks = catalogResult.rows;
    console.log(`\n🔬 Comparaison avec ${catalogTracks.length} track(s) possédant une empreinte...`);

    if (catalogTracks.length === 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  AUCUNE EMPREINTE ENREGISTRÉE DANS LE CATALOGUE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('📌 Explication : Pour que le système de détection fonctionne,');
      console.log('   chaque musique du catalogue doit avoir son empreinte acoustique');
      console.log('   générée et stockée en base de données.');
      console.log('');
      console.log('💡 Solution : Appeler l\'endpoint backend pour chaque track :');
      console.log('   POST /tracks/:id/generate-fingerprint');
      console.log('');
      console.log('   OU utiliser le script de génération en masse :');
      console.log('   node generate-all-fingerprints.mjs');
      return;
    }

    // ── 4. Comparer ────────────────────────────────────────────────────────────
    let bestMatch = null;
    let bestScore = 0;

    for (const track of catalogTracks) {
      let fp2;
      try {
        if (Array.isArray(track.fingerprint)) {
          fp2 = track.fingerprint;
        } else if (typeof track.fingerprint === 'string') {
          fp2 = JSON.parse(track.fingerprint);
        } else {
          fp2 = track.fingerprint;
        }
      } catch {
        fp2 = String(track.fingerprint).split(',').map(Number);
      }

      const score = compareFingerprints(videoFP.fingerprint, fp2);
      const bar = '█'.repeat(Math.round(score * 20)) + '░'.repeat(20 - Math.round(score * 20));
      const flag = score >= CHROMAPRINT_THRESHOLD ? ' 🚨 MATCH!' : score > 0.5 ? ' ⚠️' : '';
      console.log(`   [${bar}] ${(score * 100).toFixed(1)}%  "${track.title}" — ${track.stageName}${flag}`);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = track;
      }
    }

    // ── 5. Résultat ────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                       RÉSULTAT FINAL                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    if (bestMatch && bestScore >= CHROMAPRINT_THRESHOLD) {
      const tokens = Math.ceil(bestMatch.price / 10);
      console.log(`\n🚨 MUSIQUE PROTÉGÉE DÉTECTÉE !`);
      console.log(`   Titre     : "${bestMatch.title}"`);
      console.log(`   Artiste   : ${bestMatch.stageName}`);
      console.log(`   Prix      : ${bestMatch.price} ${bestMatch.currency} (${tokens} Jetons)`);
      console.log(`   Score     : ${(bestScore * 100).toFixed(1)}% ≥ seuil ${CHROMAPRINT_THRESHOLD * 100}%`);
      console.log(`\n   📌 rightsStatus : REQUIRES_PURCHASE`);
      console.log(`   ❌ isAuthorized  : false`);
      console.log(`   💳 tokensRequired: ${tokens}`);
      console.log(`\n   → Le système BLOQUERAIT correctement ce reel !`);
    } else if (bestMatch && bestScore > 0.5) {
      console.log(`\n⚠️  CORRESPONDANCE PARTIELLE`);
      console.log(`   Meilleur candidat : "${bestMatch.title}" (${(bestScore * 100).toFixed(1)}%)`);
      console.log(`   Score insuffisant — seuil requis : ${CHROMAPRINT_THRESHOLD * 100}%`);
      console.log(`\n   📌 rightsStatus : ORIGINAL_SOUND (pas de détection certaine)`);
      console.log(`   ✅ isAuthorized  : true (son autorisé faute de preuve)`);
    } else {
      console.log(`\n✅ AUCUNE CORRESPONDANCE — Son original autorisé`);
      console.log(`   Meilleur score : ${(bestScore * 100).toFixed(1)}% (seuil : ${CHROMAPRINT_THRESHOLD * 100}%)`);
      console.log(`\n   📌 rightsStatus : ORIGINAL_SOUND`);
      console.log(`   ✅ isAuthorized  : true`);
    }

  } catch (err) {
    console.error('\n❌ Erreur :', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('❌ Erreur fatale :', err.message);
  process.exit(1);
});
