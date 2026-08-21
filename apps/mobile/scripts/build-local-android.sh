#!/bin/bash
# ============================================================
# build-local-android.sh
# Build l'APK Android en local (sans quota EAS)
# Usage: bash scripts/build-local-android.sh
# ============================================================
set -e

# ── 1. Détecter Java ──────────────────────────────────────────
JAVA_PATH=""
for candidate in \
  "$HOME/jdk17/Contents/Home/bin/java" \
  "/usr/local/opt/openjdk@17/bin/java" \
  "/opt/homebrew/opt/openjdk@17/bin/java" \
  "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home/bin/java" \
  "$(which java 2>/dev/null)"; do
  if [ -x "$candidate" ]; then
    JAVA_PATH="$candidate"
    break
  fi
done

if [ -z "$JAVA_PATH" ]; then
  echo "❌ Java 17 non trouvé. Installez-le avec :"
  echo "   brew install openjdk@17"
  exit 1
fi

JAVA_HOME_DIR="$(dirname "$(dirname "$JAVA_PATH")")"
export JAVA_HOME="$JAVA_HOME_DIR"
echo "✅ Java trouvé : $JAVA_PATH"

# ── 2. Détecter Android SDK ───────────────────────────────────
if [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
elif [ -d "$HOME/android-sdk" ]; then
  export ANDROID_HOME="$HOME/android-sdk"
else
  echo "❌ Android SDK non trouvé."
  echo "   Installez-le avec : bash scripts/install-android-sdk.sh"
  exit 1
fi
export PATH="$ANDROID_HOME/platform-tools:$PATH"
echo "✅ Android SDK : $ANDROID_HOME"

# ── 3. Build local EAS ────────────────────────────────────────
echo ""
echo "🚀 Démarrage du build Android local..."
echo "   (Ce processus peut prendre 15-20 minutes la première fois)"
echo ""

npx --yes eas-cli build \
  --platform android \
  --profile preview \
  --local \
  --output ./build-output.apk

echo ""
echo "✅ APK généré : $(pwd)/build-output.apk"
echo "   Installez-le avec : adb install build-output.apk"
