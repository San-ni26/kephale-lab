#!/usr/bin/env bash
# ─── Kephale — Script de démarrage rapide ────────────────────────────────────

set -e

echo "🎵 Kephale — Setup de l'environnement de développement"
echo "════════════════════════════════════════════════════════"

# 1. Vérification des prérequis
echo ""
echo "📋 Vérification des prérequis..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js requis. Installez sur https://nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm requis."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker requis. Installez sur https://docker.com"; exit 1; }

echo "✅ Node $(node --version)"
echo "✅ npm $(npm --version)"
echo "✅ Docker disponible"

# 2. Installation des dépendances
echo ""
echo "📦 Installation des dépendances..."
npm install

echo ""
echo "📦 Installation des dépendances backend..."
cd apps/backend && npm install && cd ../..

echo ""
echo "📦 Installation des dépendances mobile..."
cd apps/mobile && npm install && cd ../..

echo ""
echo "📦 Installation des dépendances database..."
cd packages/database && npm install && cd ../..

# 3. Configuration .env
echo ""
echo "⚙️  Configuration des variables d'environnement..."
if [ ! -f apps/backend/.env ]; then
  cp apps/backend/.env.example apps/backend/.env
  echo "✅ Fichier .env créé depuis .env.example"
  echo "⚠️  IMPORTANT: Modifiez apps/backend/.env avec vos vraies clés API"
else
  echo "ℹ️  Le fichier .env existe déjà"
fi

# 4. Démarrage des services Docker
echo ""
echo "🐳 Démarrage de PostgreSQL et Redis via Docker..."
docker compose -f infra/docker-compose.yml up -d postgres redis

echo ""
echo "⏳ Attente que PostgreSQL soit prêt..."
sleep 5

# 5. Migrations Prisma
echo ""
echo "🗄️  Exécution des migrations Prisma..."
cd packages/database
npm run db:generate
DATABASE_URL="postgresql://kephale:kephale_dev@localhost:5432/kephale_db" npm run db:migrate -- --name init
cd ../..

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ Setup terminé ! Voici les commandes pour démarrer :"
echo ""
echo "  Backend API :"
echo "    cd apps/backend && npm run dev"
echo "    → http://localhost:4000"
echo "    → Docs API: http://localhost:4000/docs"
echo ""
echo "  App Mobile :"
echo "    cd apps/mobile && npm run dev"
echo "    → Scanner le QR code avec Expo Go"
echo ""
echo "  Services :"
echo "    PostgreSQL : localhost:5432"
echo "    Redis      : localhost:6379"
echo "    MinIO S3   : localhost:9000 (console: localhost:9001)"
echo ""
echo "  Pour arrêter Docker :"
echo "    docker compose -f infra/docker-compose.yml down"
echo ""
echo "🎵 Kephale — Bonne chance !"
