# 🎵 Kephale

> **Plateforme de streaming musical africaine** — Écoute, crée, vends et connecte-toi avec tes artistes préférés en live.

---

## 📱 Présentation

**Kephale** est une application mobile de streaming musical pensée pour le marché africain et sa diaspora. Elle permet aux auditeurs d'écouter de la musique en ligne et hors ligne, et offre aux artistes un espace complet pour monétiser leur créativité : vente de musiques, clips, Shorts, et lives interactifs avec système de dons.

---

## ✨ Fonctionnalités Principales

### Pour les Auditeurs
- 🎧 **Streaming audio** en ligne (128kbps gratuit, 320kbps Premium)
- 📥 **Écoute hors ligne** pour les abonnés Premium (fichiers chiffrés)
- 🎬 **Clips vidéo** et **Shorts** (format TikTok)
- ❤️ **Interactions** : like, commentaire, partage
- 📡 **Lives** : chat, dons, demandes de discussion avec l'artiste
- 💳 **Paiements** : Stripe, Orange Money, MTN, Wave, M-Pesa et plus

### Pour les Artistes
- 🎵 **Upload** de musiques (gratuites ou payantes)
- 🎥 **Upload** de clips vidéo et Shorts
- 📊 **Dashboard** revenus : plays, ventes, dons, abonnés
- 📡 **Lives** : diffusion, chat en direct, gestion des dons et discussions
- 💰 **Paiements automatiques** via Stripe Connect

---

## 📁 Structure du Projet

```
kephale/
├── apps/
│   ├── mobile/          # React Native (Expo)
│   └── backend/         # Node.js (Fastify)
├── packages/
│   ├── prisma/          # Schéma Prisma + migrations
│   ├── types/           # Types TypeScript partagés
│   └── utils/           # Utilitaires communs
├── infra/               # Docker Compose, configs
├── ARCHITECTURE.md      # Architecture technique complète
├── ROADMAP.md           # Feuille de route d'implémentation
└── README.md            # Ce fichier
```

---

## 🛠️ Technologies Clés

| Domaine | Stack |
|---|---|
| Mobile | React Native · Expo SDK 51 · Expo Router |
| Backend | Node.js · Fastify · TypeScript |
| Base de données | PostgreSQL · Prisma ORM |
| Cache / Temps réel | Redis · Socket.IO |
| Lives | LiveKit (WebRTC) |
| Paiements | Stripe · Flutterwave · DPO Group |
| Stockage | AWS S3 / Wasabi · Cloudflare CDN |
| Hors ligne | expo-file-system · WatermelonDB · AES-256 |
| Auth | Google OAuth2 · JWT |

---

## 📚 Documentation

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Architecture technique complète, stack, modèle de données |
| [ROADMAP.md](./ROADMAP.md) | Feuille de route d'implémentation en 6 phases (~7 mois) |

---

## 💰 Modèle Économique

| Source | Détail |
|---|---|
| Abonnements | Free (pubs) · Premium 4.99€ · Premium+ 7.99€ |
| Ventes | Commission 20% sur musiques et clips |
| Dons lives | Commission 15% sur les jetons |
| Publicités | Google AdMob pour les utilisateurs Free |
| Streams | Pool mensuel réparti selon les écoutes |

---

## 🌍 Devises Africaines Supportées

XOF · XAF · NGN · KES · TZS · GHS · ZAR · RWF · EUR · USD

---

## 🚀 Démarrage Rapide

> Documentation détaillée de setup disponible dans chaque sous-dossier.

```bash
# Cloner le repo
git clone https://github.com/your-org/kephale.git
cd kephale

# Backend (dans apps/backend)
cd apps/backend
cp .env.example .env
docker compose up -d  # PostgreSQL + Redis
npm install
npx prisma migrate dev
npm run dev

# Mobile (dans apps/mobile)
cd apps/mobile
npm install
npx expo start
```

---

## 📄 Licence

Propriétaire — © 2026 Kephale. Tous droits réservés.
