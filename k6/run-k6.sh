#!/bin/bash
# ================================================================
# run-k6.sh — Lance les tests K6 avec rapport HTML
#
# Usage :
#   bash k6/run-k6.sh                    # smoke (local)
#   bash k6/run-k6.sh load               # charge nominale
#   bash k6/run-k6.sh stress             # stress
#   bash k6/run-k6.sh soak               # endurance 30 min
#   bash k6/run-k6.sh smoke prod         # smoke sur production
# ================================================================

SCENARIO=${1:-smoke}
ENV=${2:-local}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="k6/results/$TIMESTAMP-$SCENARIO"

mkdir -p "$RESULTS_DIR"

# URL selon l'environnement
if [ "$ENV" = "prod" ]; then
  BASE_URL="https://kephale-lab.onrender.com/api/v1"
  echo "🌐 Cible : PRODUCTION ($BASE_URL)"
else
  BASE_URL="http://localhost:4000/api/v1"
  echo "🔧 Cible : LOCAL ($BASE_URL)"
fi

echo "🚀 Scénario : $SCENARIO"
echo "📁 Résultats : $RESULTS_DIR/"
echo ""

# Vérifier que k6 est installé
if ! command -v k6 &> /dev/null; then
  echo "❌ k6 n'est pas installé. Installez-le avec : brew install k6"
  exit 1
fi

# Vérifier que le backend est accessible
echo "⏳ Vérification de l'accès au backend..."
if ! curl -sf "${BASE_URL%/api/v1}/health" > /dev/null 2>&1; then
  echo "⚠️  Le backend ne répond pas sur $BASE_URL"
  echo "   → Démarrez-le avec : cd apps/backend && npm run dev"
  if [ "$ENV" != "prod" ]; then
    exit 1
  fi
fi
echo "✅ Backend accessible"
echo ""

# Lancer k6
k6 run \
  -e SCENARIO="$SCENARIO" \
  -e BASE_URL="$BASE_URL" \
  --out "json=$RESULTS_DIR/raw.json" \
  --summary-export "$RESULTS_DIR/summary.json" \
  k6/load-test.js

EXIT_CODE=$?

# Afficher le résumé
echo ""
echo "═══════════════════════════════════════════"
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Tous les seuils sont respectés !"
else
  echo "❌ Des seuils ont été dépassés — voir $RESULTS_DIR/summary.json"
fi
echo "═══════════════════════════════════════════"
echo ""
echo "📂 Résultats sauvegardés dans : $RESULTS_DIR/"
echo "   - raw.json     : données brutes ligne par ligne"
echo "   - summary.json : résumé des métriques"
