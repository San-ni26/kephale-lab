# 🗺️ Kephale — Feuille de Route d'Implémentation

> Développement en 6 phases sur ~12 mois. Chaque phase produit une version testable et déployable.

---

## Phase 1 — Fondations (Semaines 1–4)
**Objectif** : Infrastructure de base opérationnelle, authentification fonctionnelle.

### Backend
- [ ] Initialisation projet Node.js + Fastify + TypeScript
- [ ] Configuration Prisma + PostgreSQL (Docker Compose local)
- [ ] Migrations initiales : `User`, `ArtistProfile`, `Track`, `Playlist`
- [ ] Auth Google OAuth2 : vérification ID Token, création User, génération JWT
- [ ] Refresh Token + rotation sécurisée
- [ ] Middleware rate limiting (Redis)
- [ ] Upload S3 : presigned URLs pour audio et images
- [ ] Pipeline FFmpeg de base : transcodage MP3 → HLS (plusieurs qualités)
- [ ] CI/CD GitHub Actions (lint, tests, deploy staging)

### Mobile
- [ ] Initialisation Expo + Expo Router v3 + TypeScript
- [ ] Configuration EAS Build (profils dev/staging/prod)
- [ ] Écrans : Splash, Onboarding, Connexion Google
- [ ] Navigation principale (tabs + stack)
- [ ] Intégration TanStack Query + Zustand
- [ ] Player audio de base avec `react-native-track-player`
- [ ] Lecteur mini persistant en bas d'écran

### Livrable Phase 1
> ✅ Un utilisateur peut se connecter avec Google, voir une liste de musiques et en écouter une en streaming.

---

## Phase 2 — Contenu & Profil Artiste (Semaines 5–8)
**Objectif** : Les artistes peuvent uploader et gérer leur contenu.

### Backend
- [ ] CRUD Artiste : création compte artiste lié à User
- [ ] Upload musique : presigned URL S3 → webhook → transcodage FFmpeg → HLS
- [ ] Upload clip vidéo : idem avec qualités 480p/720p/1080p
- [ ] Upload Short (vidéo courte ≤ 60s)
- [ ] CRUD Playlists (publiques/privées)
- [ ] Métadonnées audio : extraction BPM, durée, waveform
- [ ] API Search : tracks, artistes, playlists (PostgreSQL full-text + pg_trgm)
- [ ] API Feed : publications récentes des artistes suivis
- [ ] Système de suivi (follow/unfollow artiste)

### Mobile
- [ ] Écran Profil Artiste : bio, cover, stats
- [ ] Onglets profil : Musiques | Clips | Shorts | Playlists
- [ ] Upload depuis l'app (artiste) : audio, image de couverture
- [ ] Lecteur vidéo clips (expo-video / expo-av)
- [ ] Feed vertical Shorts (style TikTok) avec `FlashList`
- [ ] Système like, commentaire, partage (posts + tracks)
- [ ] Écran Bibliothèque : titres sauvegardés, playlists, historique
- [ ] Écran Recherche avec suggestions

### Livrable Phase 2
> ✅ Un artiste peut uploader ses musiques et ses Shorts. Les auditeurs peuvent explorer, suivre des artistes et interagir avec le contenu.

---

## Phase 3 — Monétisation & Paiements (Semaines 9–13)
**Objectif** : Abonnements, vente de tracks, paiements mobiles africains.

### Backend
- [ ] Intégration Stripe Connect : onboarding artiste, compte lié
- [ ] Stripe Billing : abonnements Premium / Premium+ (produits + prix)
- [ ] Webhooks Stripe : `invoice.paid`, `customer.subscription.deleted`, etc.
- [ ] Achats à l'unité (track, clip) : Stripe Payment Intent avec commission auto
- [ ] Intégration Flutterwave / DPO : Mobile Money (Orange, MTN, Wave, M-Pesa)
- [ ] Système de Jetons : achat de packs, wallet utilisateur (table `UserToken`)
- [ ] Taux de change : tâche CRON BullMQ + Open Exchange Rates + cache Redis
- [ ] Affichage prix multi-devises (détection pays par IP + préférence user)
- [ ] Modèle `Purchase` et `Subscription` en base
- [ ] Dashboard revenus artiste : historique, solde disponible, demande de retrait

### Mobile
- [ ] Écran Abonnement : comparatif tiers, bouton souscription
- [ ] Intégration Stripe React Native SDK (Apple Pay, Google Pay, carte)
- [ ] Intégration Mobile Money in-app (WebView ou SDK natif)
- [ ] Achat d'une musique / d'un clip depuis la fiche
- [ ] Écran Portefeuille Jetons : solde, achat de packs
- [ ] Écran Revenus Artiste : graphiques, historique transactions
- [ ] Gestion abonnement (annulation, changement de plan)

### Livrable Phase 3
> ✅ Un utilisateur peut s'abonner en Premium, acheter une musique, payer en XOF via Orange Money. L'artiste reçoit sa part automatiquement.

---

## Phase 4 — Hors Ligne & DRM (Semaines 14–17)
**Objectif** : Écoute hors ligne sécurisée pour les abonnés Premium.

### Backend
- [ ] API Licence hors ligne : génération clé AES-256 par (userId + trackId)
- [ ] Endpoint de vérification de licence (polling toutes les 30 jours)
- [ ] Expiration automatique licences inactives
- [ ] Logs de téléchargements (quota quotidien configurable)

### Mobile
- [ ] Téléchargement via `expo-file-system` (avec progression)
- [ ] Stockage chiffré AES-256 avec clé dans `expo-secure-store`
- [ ] WatermelonDB : inventaire local (tracks téléchargées, statut licence)
- [ ] Lecture hors ligne via `react-native-track-player` (fichier local)
- [ ] UI : indicateur téléchargé, gestion du stockage, suppression
- [ ] Bascule automatique online/offline (NetInfo)

### Livrable Phase 4
> ✅ Un abonné Premium peut télécharger des musiques achetées, les écouter sans connexion, avec fichiers chiffrés et licence expirable.

---

## Phase 5 — Lives & Temps Réel (Semaines 18–23)
**Objectif** : Lives artiste avec dons, chat et demandes de discussion.

### Backend
- [ ] Intégration LiveKit Server (Cloud ou self-hosted)
- [ ] API : créer/démarrer/terminer un live → génération room LiveKit
- [ ] Tokens d'accès LiveKit (publisher pour artiste, subscriber pour spectateurs)
- [ ] Socket.IO rooms : `live:{liveId}` (chat, dons, events)
- [ ] Gestion dons en temps réel : déduction jetons, alerte artiste
- [ ] Demande de discussion : queue, acceptation artiste, room privée LiveKit
- [ ] Enregistrement live : LiveKit Egress → S3 → disponible après fin de live
- [ ] Notifications push (Expo Push Notifications) : "Artiste X est en live"
- [ ] BullMQ : versement revenus live à la clôture (jetons → Stripe Connect)

### Mobile
- [ ] Écran Lancement Live (artiste) : titre, aperçu caméra, démarrer
- [ ] Écran Spectateur Live : vidéo plein écran, chat overlay, compteur viewers
- [ ] Bouton Faire un Don : sélection jetons + message, confirmation
- [ ] Alertes dons animées (style Twitch/TikTok Live)
- [ ] Bouton Demander à Discuter : envoi request + état (en attente/accepté)
- [ ] Vue artiste : liste demandes de discussion en attente
- [ ] Room privée discussion : vidéo bi-directionnelle avec 1 spectateur
- [ ] Notifications push intégrées (Expo)
- [ ] Replay live disponible dans l'onglet Clips de l'artiste

### Livrable Phase 5
> ✅ Un artiste peut lancer un live. Les spectateurs chattent, font des dons en jetons, demandent à discuter. L'artiste accepte une discussion en vidéo.

---

## Phase 6 — Publicités, Analytics & Finalisation (Semaines 24–28)
**Objectif** : Monétisation publicitaire, analytics, performance, App Store.

### Backend
- [ ] Intégration Google AdMob (compte ad network)
- [ ] Insertion publicités audio (entre les tracks pour les users Free)
- [ ] Pool de revenus artistes : répartition mensuelle selon streams (modèle Spotify)
- [ ] Dashboard Admin : revenus globaux, modération contenus, utilisateurs
- [ ] Analytics : événements PostHog (plays, skips, achats, conversions)
- [ ] Audit sécurité complet (OWASP Top 10)
- [ ] Load testing (k6) : simuler 10 000 utilisateurs simultanés

### Mobile
- [ ] Intégration AdMob : bannières pour users Free, interstitiels entre sessions
- [ ] Écran Analytics Artiste : graphiques plays/revenus/followers (recharts ou Victory)
- [ ] Onboarding artiste amélioré (vérification identité via Stripe Identity)
- [ ] Thème sombre/clair, accessibilité (A11y)
- [ ] Optimisation performances (memo, lazy loading, bundle size)
- [ ] Tests E2E (Detox ou Maestro)

### Livrable Phase 6
> ✅ Application complète, testée, prête pour soumission App Store et Google Play.

---

## Récapitulatif Timeline

| Phase | Durée | Jalons clés |
|---|---|---|
| **1 — Fondations** | 4 semaines | Auth Google, lecteur audio, streaming basique |
| **2 — Contenu Artiste** | 4 semaines | Upload, profil artiste, feed, Shorts |
| **3 — Monétisation** | 5 semaines | Stripe, Mobile Money, abonnements, vente |
| **4 — Hors Ligne** | 4 semaines | Téléchargement chiffré, DRM léger |
| **5 — Lives** | 6 semaines | LiveKit, dons, chat temps réel, discussions |
| **6 — Publicités & Finalisation** | 5 semaines | AdMob, analytics, tests, App Store |
| **Total** | **~28 semaines** | **~7 mois** |

---

## Équipe Recommandée

| Rôle | Nombre |
|---|---|
| Lead Developer Full-Stack | 1 |
| Développeur React Native | 1–2 |
| Développeur Backend Node.js | 1 |
| DevOps / Infrastructure | 1 (part-time) |
| Designer UI/UX | 1 |
| Product Manager | 1 |

---

## Budget Infrastructure Estimé (par mois, phase production)

| Service | Coût estimé |
|---|---|
| Railway / Render (Backend) | ~$30–50 |
| PostgreSQL managé (Supabase/Neon) | ~$25 |
| Redis (Upstash) | ~$10 |
| S3 / Wasabi (stockage fichiers) | ~$20–100 selon volume |
| Cloudflare (CDN + DNS) | ~$20 |
| LiveKit Cloud | ~$0.05/participant/min (~$100–500 selon usage) |
| Open Exchange Rates API | ~$12 |
| **Total** | **~$220–$800/mois** |
