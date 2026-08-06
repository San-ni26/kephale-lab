# 🎵 Kephale — Architecture Technique Complète

> Application mobile de streaming musical avec lives, vente de contenu et monétisation multi-devises africaines.

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────┐
│                  KEPHALE APP                        │
│           React Native (Expo) — iOS / Android       │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
    ┌──────────▼──────────┐  ┌────────▼────────────┐
    │   API Gateway       │  │  CDN / Media Edge   │
    │   (Nginx / Caddy)   │  │  (Cloudflare / AWS) │
    └──────────┬──────────┘  └─────────────────────┘
               │
    ┌──────────▼──────────────────────────────────────┐
    │            Backend Services (Node.js)            │
    │  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
    │  │  REST API   │  │ Socket.IO│  │ LiveKit    │ │
    │  │  (Fastify)  │  │ (WS)     │  │ Signaling  │ │
    │  └─────────────┘  └──────────┘  └────────────┘ │
    └──────────┬──────────────────────────────────────┘
               │
    ┌──────────▼──────────────────────────────────────┐
    │               Couche Données                     │
    │  ┌──────────────┐  ┌──────────┐  ┌───────────┐ │
    │  │  PostgreSQL  │  │  Redis   │  │   S3 /    │ │
    │  │  (via Prisma)│  │  Cache   │  │  Wasabi   │ │
    │  └──────────────┘  └──────────┘  └───────────┘ │
    └─────────────────────────────────────────────────┘
```

---

## 2. Stack Technique

### 2.1 Frontend Mobile
| Technologie | Rôle | Justification |
|---|---|---|
| **React Native + Expo SDK 51+** | App iOS & Android | Cross-platform, OTA updates |
| **Expo Router v3** | Navigation | File-based routing, deep links |
| **Zustand** | State management | Léger, performant, TypeScript-friendly |
| **TanStack Query (React Query)** | Data fetching & cache | Gestion cache, pagination, offline |
| **MMKV** | Storage clé-valeur ultra-rapide | Remplacement AsyncStorage |
| **expo-av / expo-video** | Lecture audio/vidéo | Player natif iOS & Android |
| **expo-file-system** | Téléchargements hors ligne | Accès filesystem natif |
| **expo-sqlite + WatermelonDB** | Base de données locale | Hors ligne, sync, performant |
| **expo-crypto** | Chiffrement fichiers hors ligne | Protection DRM légère |
| **expo-auth-session** | OAuth2 Google | Auth sans serveur propre |
| **socket.io-client** | WebSocket temps réel | Live chat, dons, notifications |
| **@livekit/react-native** | Live streaming | SDK natif LiveKit |
| **react-native-track-player** | Lecteur audio background | Contrôles système, queue, HLS |
| **Shopify/flash-list** | Listes performantes | FlatList amélioré |
| **react-native-reanimated 3** | Animations | 60/120 fps, UI thread |
| **Stripe React Native SDK** | Paiements in-app | Apple Pay, Google Pay |

---

### 2.2 Backend
| Technologie | Rôle |
|---|---|
| **Node.js 20 LTS** | Runtime |
| **Fastify v4** | Framework HTTP ultra-performant |
| **Prisma ORM** | Accès base de données (PostgreSQL) |
| **PostgreSQL 16** | Base de données principale |
| **Redis 7** | Cache sessions, rate limiting, pub/sub |
| **Socket.IO 4** | Temps réel : live chat, dons, notifications |
| **LiveKit Server** | Orchestration des streams vidéo live |
| **BullMQ** | File de tâches (emails, encoding, webhooks) |
| **FFmpeg** | Transcodage audio/vidéo (HLS, qualités multiples) |
| **Sharp** | Traitement images (thumbnails, covers) |
| **Nodemailer + Resend** | Emails transactionnels |
| **Zod** | Validation des données |
| **JWT + Refresh Tokens** | Authentification stateless |

---

### 2.3 Infrastructure & DevOps
| Technologie | Rôle |
|---|---|
| **AWS S3 / Wasabi** | Stockage fichiers (musique, vidéos, images) |
| **AWS CloudFront / Cloudflare** | CDN pour délivrer le contenu |
| **AWS MediaConvert / Mux.com** | Transcodage vidéo serverless (alternative FFmpeg) |
| **Docker + Docker Compose** | Containerisation locale et staging |
| **GitHub Actions** | CI/CD |
| **Railway / Render / AWS ECS** | Hébergement backend |
| **Expo EAS (Build & Submit)** | Build et soumission App Store / Play Store |
| **Sentry** | Monitoring erreurs (front + back) |
| **PostHog** | Analytics comportemental |

---

## 3. Authentification & Comptes

### 3.1 Flux OAuth2 Google
```
App Mobile → OAuth2 Google → ID Token Google
     → Backend vérifie le token (Google API)
     → Crée ou retrouve l'User en DB
     → Retourne JWT (access + refresh token)
```

### 3.2 Modèle de Comptes
```
User (compte de base)
  │
  ├── Rôle: LISTENER  (auditeur)
  ├── Rôle: PREMIUM   (abonné payant)
  └── Rôle: ARTIST    (compte artiste lié 1:1)
              │
              ├── Musiques (payantes ou gratuites)
              ├── Clips vidéo
              ├── Shorts (format TikTok)
              ├── Playlists publiques
              └── Lives
```

---

## 4. Gestion des Lives

### 4.1 Architecture LiveKit
```
Artiste (Publisher)
     │  SDK LiveKit React Native
     ▼
LiveKit Server (Cloud / self-hosted)
     │
     ▼  HLS / WebRTC
Spectateurs (Subscribers) — 10 à 100 000+

Socket.IO (Backend)
  ├── Room: live:{liveId}
  ├── Events: donation, chat_message, discussion_request
  └── Broadcast: viewer_count, donation_alert
```

### 4.2 Fonctionnalités Live
| Feature | Technologie |
|---|---|
| Diffusion vidéo | LiveKit (WebRTC) |
| Chat en temps réel | Socket.IO room |
| Dons (jetons) | Stripe Payment Intents + Socket.IO |
| Demande de discussion | Socket.IO + notification artiste |
| Mini-session privée | LiveKit room privée secondaire |
| Enregistrement du live | LiveKit Egress → S3 |

---

## 5. Stockage Hors Ligne

### 5.1 Architecture
```
Utilisateur achète/télécharge une musique
        │
        ▼
expo-file-system.downloadAsync()
   → Fichier MP3/HLS chiffré dans app storage
        │
        ▼
WatermelonDB (base locale)
   → Entrée: { trackId, filePath, encryptionKey, expiresAt }
        │
        ▼
react-native-track-player
   → Lit le fichier local déchiffré à la volée
```

### 5.2 DRM Léger
- Chiffrement AES-256 des fichiers avec clé unique par utilisateur/track
- Clé stockée dans **Expo SecureStore** (Keychain iOS / Keystore Android)
- Vérification de validité à la lecture (licence achetée toujours valide)
- Expiration de la licence hors ligne après 30 jours sans connexion (configurable)

---

## 6. Monétisation

### 6.1 Modèle Freemium
| Tier | Prix | Fonctionnalités |
|---|---|---|
| **Free** | 0 € | Écoute en ligne, pubs, qualité 128kbps |
| **Premium** | 4.99 €/mois | Hors ligne, sans pubs, qualité 320kbps, HiFi |
| **Premium+** | 7.99 €/mois | Premium + Accès clips HD, lives exclusifs |

### 6.2 Revenus Artiste
| Source | Commission Kephale | Part Artiste |
|---|---|---|
| Vente musique | 20% | 80% |
| Vente clip | 20% | 80% |
| Dons live (jetons) | 15% | 85% |
| Streams (pool mensuel) | Géré plateforme | Selon écoutes |
| Publicités | 100% plateforme | Bonus via pool |

### 6.3 Système de Jetons (Dons Live)
```
1 Jeton = 0.10 € (équivalent en monnaie locale)
Packs disponibles: 10, 50, 100, 500, 1000 jetons
Achat via Stripe (Apple Pay, Google Pay, carte, Mobile Money)
```

---

## 7. Paiements & Devises Africaines

### 7.1 Stack Paiement
| Technologie | Rôle |
|---|---|
| **Stripe** | Cartes bancaires, Apple Pay, Google Pay |
| **Stripe Connect** | Paiements directs artistes (marketplace) |
| **Stripe Billing** | Gestion abonnements récurrents |
| **DPO Group / Flutterwave** | Mobile Money Afrique (Orange Money, MTN, Wave, M-Pesa) |
| **Flutterwave** | Fallback multi-devises africaines |
| **Open Exchange Rates API** | Taux de change temps réel |

### 7.2 Devises Supportées
| Pays | Devise | Mobile Money |
|---|---|---|
| Sénégal, Côte d'Ivoire, Mali | XOF | Orange Money, Wave, Free Money |
| Cameroun, Congo | XAF | Orange Money, MTN Mobile Money |
| Nigeria | NGN | Flutterwave, Paystack |
| Kenya, Tanzanie | KES, TZS | M-Pesa |
| Ghana | GHS | MTN Mobile Money |
| Afrique du Sud | ZAR | Stripe natif |
| Rwanda | RWF | MTN Mobile Money |

### 7.3 Système de Change
```
Tâche CRON (BullMQ) : toutes les heures
  → Appel Open Exchange Rates API
  → Mise à jour Redis: { EUR_TO_XOF: 655.96, EUR_TO_NGN: 1820, ... }
  → Tous les prix affichés en monnaie locale en temps réel
  → Paiement traité dans la devise native de la passerelle
```

---

## 8. Modèle de Données Prisma (Résumé)

```prisma
model User {
  id          String   @id @default(cuid())
  googleId    String   @unique
  email       String   @unique
  name        String
  avatar      String?
  role        Role     @default(LISTENER)
  subscription Subscription?
  artistProfile ArtistProfile?
  purchases   Purchase[]
  tokens      UserToken[]  // jetons pour dons
  createdAt   DateTime @default(now())
}

model ArtistProfile {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id])
  stageName   String
  bio         String?
  coverImage  String?
  tracks      Track[]
  clips       Clip[]
  shorts      Short[]
  lives       Live[]
  playlists   Playlist[]
  stripeAccountId String?  // Stripe Connect
}

model Track {
  id          String   @id @default(cuid())
  artistId    String
  artist      ArtistProfile @relation(fields: [artistId], references: [id])
  title       String
  duration    Int      // secondes
  coverUrl    String
  audioUrl    String   // URL S3 HLS
  price       Float    @default(0)  // 0 = gratuit
  currency    String   @default("EUR")
  genre       String[]
  plays       Int      @default(0)
  purchases   Purchase[]
  createdAt   DateTime @default(now())
}

model Live {
  id          String   @id @default(cuid())
  artistId    String
  artist      ArtistProfile @relation(fields: [artistId], references: [id])
  title       String
  roomId      String   @unique  // LiveKit room ID
  status      LiveStatus @default(SCHEDULED)
  startedAt   DateTime?
  endedAt     DateTime?
  recordingUrl String?
  donations   Donation[]
  viewerPeak  Int      @default(0)
}

model Donation {
  id          String   @id @default(cuid())
  liveId      String
  live        Live     @relation(fields: [liveId], references: [id])
  fromUserId  String
  tokens      Int
  message     String?
  createdAt   DateTime @default(now())
}

enum Role { LISTENER PREMIUM PREMIUM_PLUS ARTIST ADMIN }
enum LiveStatus { SCHEDULED LIVE ENDED }
```

---

## 9. Sécurité

| Menace | Contre-mesure |
|---|---|
| Piratage fichiers hors ligne | AES-256 + licence expirable |
| Abus API | Rate limiting Redis (Fastify Rate Limit) |
| Paiements frauduleux | Stripe Radar, webhooks signés |
| Injection SQL | Prisma ORM (requêtes paramétrées) |
| Token volé | JWT short-lived (15min) + Refresh Token rotation |
| MITM | TLS 1.3 obligatoire, Certificate Pinning mobile |
| Abus lives/dons | Détection anomalies via BullMQ + alertes admin |

---

## 10. Scalabilité

- **Horizontal scaling** : Backend stateless (JWT), Redis pour sessions partagées
- **CDN** : Cloudflare pour servir audio/vidéo à faible latence en Afrique
- **LiveKit** : Mode cloud (LiveKit Cloud) pour gérer la montée en charge automatiquement
- **PostgreSQL** : Read replicas pour les requêtes lourdes (search, analytics)
- **BullMQ** : Workers séparés pour l'encoding vidéo (tâches lourdes isolées)
