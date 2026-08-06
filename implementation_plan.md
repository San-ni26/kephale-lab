# 🔒 Renforcement du Système de Vérification des Droits Sonores — Studio Reel

## Contexte

Le système actuel dans [audio-fingerprint.service.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/audio-fingerprint.service.ts) est censé détecter si un utilisateur utilise une musique protégée (payante) du catalogue Kephale dans ses Reels/Shorts. L'objectif est de rendre cette détection **plus robuste que Shazam** pour empêcher toute utilisation non autorisée de musiques payantes.

---

## 🚨 Problèmes Critiques Identifiés (12 failles)

### Faille 1 — Le "Fingerprint" n'est PAS une empreinte acoustique réelle

> [!CAUTION]
> **Gravité : CRITIQUE** — Le fingerprint actuel est un simple hash SHA-256 du titre + nom d'artiste + URL. Ce n'est **PAS** une analyse audio spectrale.

```typescript
// Ligne 31-37 de audio-fingerprint.service.ts — Ce code est FAUX
public static generateFingerprint(inputData: string | Buffer): string {
  const normalized = rawStr.replace(/[^a-z0-9]/g, '');
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `fp_kph_${hash.substring(0, 32)}`;
}
```

**Problème** : Un hash de texte ne peut jamais détecter une musique dans un flux audio. Shazam utilise l'analyse spectrale (spectrogramme → constellation de pics → hashing), pas un hash de métadonnées.

---

### Faille 2 — La détection repose sur la comparaison de TEXTE, pas d'AUDIO

> [!CAUTION]
> **Gravité : CRITIQUE** — La méthode `analyzeAndDetectCopyright` (ligne 77-188) compare uniquement des chaînes de caractères : titre, description, nom de fichier.

**Contournements triviaux** :
- Renommer le fichier `video_001.mp4` au lieu de `titre_chanson.mp4`
- Ne pas mettre le titre de la chanson dans le titre/description du reel
- Uploader avec un titre aléatoire → **0% de détection**

---

### Faille 3 — `detectByAcousticWaveform` ne fait AUCUNE analyse audio

> [!WARNING]
> **Gravité : HAUTE** — La fonction [detectByAcousticWaveform](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/audio-fingerprint.service.ts#L277-L315) prétend faire une analyse acoustique mais compare un hash de l'**URL de la vidéo** avec les fingerprints des tracks (qui sont eux-mêmes des hash de texte).

```typescript
// Ligne 283 — Compare un hash d'URL avec un hash de titre (?!)
const videoHash = this.generateFingerprint(videoUrl);
const sim = this.calculateSimilarity(videoHash, track.fingerprint);
```

Cela revient à comparer `https://s3.../video_123.mp4` avec `titre chanson artiste`. La similarité sera **toujours ~0**.

---

### Faille 4 — L'API AudD est le seul vrai outil mais mal implémentée

> [!WARNING]
> **Gravité : HAUTE** — L'intégration AudD (ligne 296-310) :
> - Envoie une URL publique brute (pas d'extraction audio ni de segment)
> - Ne gère pas les erreurs réseau correctement (catch silencieux)
> - La comparaison du résultat AudD avec le catalogue est trop simpliste (simple `includes` sur le titre)
> - Pas de fallback si AudD est indisponible

---

### Faille 5 — Aucune vérification côté serveur après l'upload

> [!IMPORTANT]
> La vérification se fait **avant** l'upload final (dans le POST `/videos`), mais le fichier vidéo est déjà uploadé sur S3. L'audio n'est **jamais extrait** du fichier vidéo réel pour analyse.

---

### Faille 6 — `calculateSimilarity` est une distance Levenshtein inadaptée

La fonction Levenshtein (lignes 43-72) compare des chaînes de texte. Elle n'a aucune pertinence pour la détection audio. Un titre comme "Mon Amour" matcherait avec "Mon Armour" (faute de frappe) mais PAS avec le même morceau joué en fond sonore.

---

### Faille 7 — Le seuil de 0.65 est trop bas et génère des faux positifs

```typescript
if (bestMatchTrack && highestScore >= 0.65) // Ligne 169
```

Un score de 0.65 en Levenshtein signifie que 35% des caractères diffèrent. Cela peut matcher des titres complètement différents.

---

### Faille 8 — Pas de cache/rate-limiting sur la vérification

Chaque appel à `analyzeAndDetectCopyright` charge **TOUS** les tracks payants depuis la DB. Avec 10 000 tracks, c'est une query massive à chaque upload de reel.

---

### Faille 9 — `AccessControlService.canAccessTrack` ne vérifie pas le statut du paiement

Dans [access.service.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/access.service.ts#L58-L62), le `findFirst` sur `Purchase` ne filtre **pas** par `status: 'SUCCEEDED'` :

```typescript
const purchase = await prisma.purchase.findFirst({
  where: { OR: orConditions },  // ❌ Pas de filtre status !
});
```

Un paiement `PENDING` ou `FAILED` donnerait quand même accès.

---

### Faille 10 — Le client mobile peut bypasser la vérification

Le endpoint `verify-audio-rights` est un appel séparé (optionnel côté client). Le client pourrait :
1. Skipper l'appel de pré-vérification
2. Envoyer directement au POST `/videos` avec un `audioTrackId` vide et un `originalAudioName` bidon

---

### Faille 11 — Pas de re-vérification après transcodage

Après le transcodage vidéo (dans la queue BullMQ), l'audio n'est **jamais** ré-analysé. Une vidéo pourrait passer la vérification textuelle puis contenir un audio protégé.

---

### Faille 12 — Pas de système de signalement/dispute

Il n'existe aucun mécanisme pour qu'un artiste signale qu'un reel utilise sa musique sans autorisation (copyright strike).

---

## Changements Proposés

### Architecture Multi-Couches (surpasser Shazam)

```
┌─────────────────────────────────────────────────────────────────┐
│                SYSTÈME DE DÉTECTION MULTI-COUCHES               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Couche 1: Métadonnées (rapide, 10ms)                          │
│  ├── Hash exact du fichier audio (SHA-256 du binaire)           │
│  ├── Comparaison titre/artiste normalisée (améliorée)           │
│  └── Vérification audioTrackId en DB                            │
│                                                                 │
│  Couche 2: Empreinte acoustique Chromaprint (100ms)             │
│  ├── Extraction audio via FFmpeg (du fichier vidéo réel)        │
│  ├── Génération fingerprint via fpcalc (Chromaprint/AcoustID)   │
│  ├── Comparaison avec la base d'empreintes de toutes les tracks │
│  └── Score de similarité spectrale ≥ 0.85 = match              │
│                                                                 │
│  Couche 3: API externe ACRCloud (200ms)                         │
│  ├── Envoi d'un segment audio (10-20s) à ACRCloud               │
│  ├── Reconnaissance musicale professionnelle                    │
│  ├── Matching croisé avec le catalogue Kephale                  │
│  └── Fallback AudD si ACRCloud indisponible                     │
│                                                                 │
│  Couche 4: Vérification post-upload asynchrone (BullMQ)         │
│  ├── Job de re-vérification après transcodage                   │
│  ├── Extraction audio complète du fichier transcodé             │
│  ├── Analyse Chromaprint + ACRCloud sur le fichier final        │
│  └── Marquage/blocage automatique si violation détectée         │
│                                                                 │
│  Couche 5: Signalement et Copyright Strikes                     │
│  ├── Endpoint de signalement pour artistes                      │
│  ├── Review admin des disputes                                  │
│  └── Système de 3 strikes → ban temporaire                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Composant 1 — Service Fingerprint Refondé

#### [MODIFY] [audio-fingerprint.service.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/audio-fingerprint.service.ts)

Réécriture complète du service :

1. **`generateAcousticFingerprint(audioFilePath)`** — Utilise FFmpeg pour extraire l'audio puis `fpcalc` (Chromaprint CLI) pour générer une vraie empreinte acoustique
2. **`extractAudioFromVideo(videoS3Key)`** — Télécharge la vidéo depuis S3, extrait la piste audio via FFmpeg (`-vn -acodec pcm_s16le`)
3. **`compareFingerprints(fp1, fp2)`** — Comparaison spectrale par corrélation croisée des empreintes Chromaprint (pas Levenshtein)
4. **`queryACRCloud(audioSegmentPath)`** — Appel à l'API ACRCloud pour reconnaissance musicale professionnelle
5. **`queryAudD(audioSegmentPath)`** — Fallback vers AudD (amélioré : envoi du fichier, pas d'URL)
6. **`analyzeAndDetectCopyright()`** — Pipeline multi-couches orchestrant toutes les vérifications
7. **Cache Redis** des fingerprints pour éviter de recalculer à chaque fois

---

### Composant 2 — Service d'Accès Renforcé

#### [MODIFY] [access.service.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/services/access.service.ts)

- Ajouter `status: 'SUCCEEDED'` au filtre des achats dans `canAccessTrack`, `canAccessVideo`, `canAccessAlbum`
- Ajouter un système de cache Redis pour les vérifications d'accès fréquentes

---

### Composant 3 — Route Vidéo Renforcée

#### [MODIFY] [videos.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/videos.ts)

- POST `/videos` : Vérification obligatoire côté serveur avec extraction audio du fichier uploadé (pas juste les métadonnées texte)
- Ajout du job de post-vérification dans la queue BullMQ après transcodage

---

### Composant 4 — Route Tracks Renforcée

#### [MODIFY] [tracks.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/routes/tracks.ts)

- Génération du fingerprint Chromaprint **réel** lors de la création d'une track (via le job BullMQ de transcodage)

---

### Composant 5 — Queue de Transcodage Améliorée

#### [MODIFY] [transcode.ts](file:///Users/paulkone/Desktop/app/app-kephale/apps/backend/src/queues/transcode.ts)

- Après transcodage audio : générer et sauvegarder le fingerprint Chromaprint réel en DB
- Nouveau job `verify-video-audio` : après transcodage vidéo, extraire l'audio et vérifier les droits

---

### Composant 6 — Système de Copyright Strikes

#### [NEW] copyright-strikes.ts (route)
#### [NEW] copyright.service.ts (service)

- Endpoint POST `/api/v1/copyright/report` — Signalement par un artiste
- Endpoint GET `/api/v1/admin/copyright-reports` — Dashboard admin
- Modèle Prisma `CopyrightReport` et `CopyrightStrike`
- Système de 3 strikes → blocage temporaire de l'upload

---

### Composant 7 — Schéma Prisma

#### [MODIFY] [schema.prisma](file:///Users/paulkone/Desktop/app/app-kephale/packages/database/prisma/schema.prisma)

Nouveaux modèles :
```prisma
model CopyrightReport {
  id           String @id @default(cuid())
  reporterId   String // L'artiste qui signale
  videoId      String
  trackId      String // Le track protégé
  status       String @default("PENDING") // PENDING, CONFIRMED, REJECTED
  adminNotes   String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model CopyrightStrike {
  id          String @id @default(cuid())
  userId      String // L'utilisateur qui enfreint
  reportId    String
  videoId     String
  expiresAt   DateTime?
  createdAt   DateTime @default(now())
}
```

---

## Questions Ouvertes

> [!IMPORTANT]
> **1. API de reconnaissance musicale** : Souhaitez-vous utiliser ACRCloud (plus pro, payant ~$300/mois), AudD (plus simple, ~$25/mois), ou les deux en cascade ? J'implémente le code pour supporter les deux avec un fallback automatique.

> [!IMPORTANT]
> **2. Chromaprint/fpcalc** : L'outil `fpcalc` doit être installé sur le serveur (via `apt install libchromaprint-tools` ou via Docker). Confirmez-vous que le déploiement Docker est possible ?

> [!IMPORTANT]
> **3. Seuil de blocage** : Le seuil actuel est 0.65 (très bas). Je recommande **0.85** pour les fingerprints Chromaprint et **0.90** pour les résultats d'API externe. Cela réduit les faux positifs tout en attrapant les vraies violations. D'accord ?

> [!IMPORTANT]
> **4. Comportement en cas de violation post-upload** : Que faire si une vidéo déjà publiée est détectée en violation après la vérification BullMQ ?
> - Option A : Suppression automatique + notification à l'utilisateur
> - Option B : Marquage "sous examen" + notification à l'artiste propriétaire
> - Option C : Monetisation redirigée vers l'artiste original (comme YouTube Content ID)

---

## Plan de Vérification

### Tests Automatisés
```bash
# Tests unitaires du service de fingerprint
npm run test -- --filter audio-fingerprint

# Test d'intégration du pipeline de vérification
npm run test:integration -- --filter copyright
```

### Vérification Manuelle
1. Uploader un reel avec une musique payante du catalogue → doit être détecté et bloqué
2. Uploader un reel avec un son original → doit passer
3. Uploader un reel avec une musique payante renommée → doit être détecté par Chromaprint
4. Vérifier que les tracks déjà achetées passent la vérification
5. Tester le système de copyright strike bout en bout
