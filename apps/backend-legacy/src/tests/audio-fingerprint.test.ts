import { prisma } from '@kephale/database';
import { AudioFingerprintService } from '../services/audio-fingerprint.service.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

/**
 * Suite de tests unitaires & d'intégration Chromaprint (-raw) :
 *
 * 1. Test d'identité (Même fichier 2x → score ~1.0)
 * 2. Test de match avec offset (Segment 0s vs Segment 5s → score > 0.70)
 * 3. Test de non-match (Deux sons différents → score < 0.35)
 * 4. Test End-to-End (Vidéo avec morceau connu → detectionMethod: 'CHROMAPRINT')
 *
 * Execution : npx tsx src/tests/audio-fingerprint.test.ts
 */
async function runAudioFingerprintTests() {
  console.log('====================================================');
  console.log('🧪 SUITE DE TESTS CHROMAPRINT (-raw) & DE SÉCURITÉ AUDIO');
  console.log('====================================================\n');

  const sampleVideoPath = '/Users/paulkone/Desktop/app/app-kephale/v1c044g50000d9d9777og65t43d3dhe0.MP4';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-fp-suite-'));

  let passedTests = 0;
  let totalTests = 4;

  try {
    if (!fs.existsSync(sampleVideoPath)) {
      throw new Error(`Fichier vidéo de test introuvable : ${sampleVideoPath}`);
    }

    // ── TEST 1 : TEST D'IDENTITÉ ─────────────────────────────────────────────
    console.log('TEST 1 : Test d\'Identité (fp1 vs fp1)...');
    const segment1Path = await AudioFingerprintService.extractAudioSegment(sampleVideoPath, tmpDir, 0, 20);
    const fp1Result = await AudioFingerprintService.generateChromaprintFingerprint(segment1Path);

    const identityScore = AudioFingerprintService.compareFingerprints(fp1Result.fingerprint, fp1Result.fingerprint);
    console.log(`   Score obtenu : ${identityScore.toFixed(4)}`);

    if (identityScore >= 0.95) {
      console.log('   ✅ PASS : Score d\'identité >= 0.95 (attendu 1.0000)\n');
      passedTests++;
    } else {
      console.error(`   ❌ FAIL : Score d'identité insuffisant : ${identityScore}\n`);
    }

    // ── TEST 2 : TEST DE MATCH AVEC OFFSET (0s vs 5s) ──────────────────────
    console.log('TEST 2 : Test de Vrai Match avec Offset (Segment 0s vs 5s)...');
    const segment2Path = await AudioFingerprintService.extractAudioSegment(sampleVideoPath, tmpDir, 5, 20);
    const fp2Result = await AudioFingerprintService.generateChromaprintFingerprint(segment2Path);

    const offsetScore = AudioFingerprintService.compareFingerprints(fp1Result.fingerprint, fp2Result.fingerprint);
    console.log(`   Score d'alignement glissant obtenu : ${offsetScore.toFixed(4)}`);

    if (offsetScore >= 0.70) {
      console.log('   ✅ PASS : Match avec offset valide (score >= 0.70)\n');
      passedTests++;
    } else {
      console.error(`   ❌ FAIL : Score d'offset trop bas : ${offsetScore}\n`);
    }

    // ── TEST 3 : TEST DE NON-MATCH (Deux pistes différentes) ───────────────
    console.log('TEST 3 : Test de Non-Match (Chansons/Sons totalement différents)...');
    // Récupérer un morceau du catalogue distinct
    const tracks = await prisma.track.findMany({
      where: { s3Key: { not: null }, fingerprint: { not: null } },
      take: 5,
    });

    // Trouver un track avec une empreinte différente de sampleVideoPath
    let nonMatchTrack = null;
    let lowestScore = 1.0;

    for (const tr of tracks) {
      if (tr.fingerprint && !tr.fingerprint.startsWith('fallback_')) {
        const sc = AudioFingerprintService.compareFingerprints(fp1Result.fingerprint, tr.fingerprint);
        if (sc < lowestScore) {
          lowestScore = sc;
          nonMatchTrack = tr;
        }
      }
    }

    console.log(`   Morceau le plus éloigné testé : "${nonMatchTrack?.title || 'Track'}"`);
    console.log(`   Score de similarité : ${lowestScore.toFixed(4)}`);

    if (lowestScore < 0.65) {
      console.log('   ✅ PASS : Distinction des morceaux différents réussie (score < 0.65)\n');
      passedTests++;
    } else {
      console.error(`   ❌ FAIL : Faux positif détecté avec un morceau distinct : ${lowestScore}\n`);
    }

    // ── TEST 4 : TEST END-TO-END (analyzeAndDetectCopyright) ────────────────
    console.log('TEST 4 : Test End-to-End analyzeAndDetectCopyright avec vidéo réelle...');
    const knownTrack = await prisma.track.findFirst({
      where: { title: { contains: 'ESSAYE', mode: 'insensitive' } },
      select: { id: true, title: true, s3Key: true, fingerprint: true },
    });

    if (!knownTrack || !knownTrack.s3Key) {
      console.warn('   ⚠️ Aucun morceau "J\'AI ESSAYÉ" trouvé pour le test E2E.');
    } else {
      // Exécuter l'analyse complète
      const analysisResult = await AudioFingerprintService.analyzeAndDetectCopyright({
        userId: 'test-user-e2e',
        videoS3Key: knownTrack.s3Key,
        originalAudioName: 'v1c044g50000d9d9777og65t43d3dhe0.MP4',
      });

      console.log('   Méthode de détection :', analysisResult.detectionMethod);
      console.log('   Morceau reconnu :', analysisResult.matchedTrack?.title);
      console.log('   Score de similarité :', analysisResult.similarityScore ? (analysisResult.similarityScore * 100).toFixed(2) + '%' : 'N/A');
      console.log('   Statut des droits :', analysisResult.rightsStatus);

      if (analysisResult.detectionMethod === 'CHROMAPRINT' && analysisResult.matchedTrack) {
        console.log('   ✅ PASS : Détection End-to-End Chromaprint valide avec le bon morceau matched !\n');
        passedTests++;
      } else {
        console.error('   ❌ FAIL : Échec de la détection E2E Chromaprint.\n');
      }
    }

  } catch (err: any) {
    console.error('❌ Erreur durant l\'exécution des tests :', err?.message || err);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await prisma.$disconnect();
  }

  console.log('====================================================');
  console.log(`📊 RÉSULTAT DES TESTS : ${passedTests} / ${totalTests} PASSED`);
  console.log('====================================================\n');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runAudioFingerprintTests();
