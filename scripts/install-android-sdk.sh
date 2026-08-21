#!/bin/bash
# Script d'installation Android SDK pour build local EAS
set -e

ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
CMDLINE_TOOLS_ZIP="/tmp/cmdline-tools.zip"

echo "📦 Installation Android SDK..."
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"

echo "⬇️  Téléchargement des outils..."
curl -L --retry 3 --retry-delay 5 -o "$CMDLINE_TOOLS_ZIP" "$CMDLINE_TOOLS_URL"

echo "📂 Extraction..."
unzip -q "$CMDLINE_TOOLS_ZIP" -d "$ANDROID_SDK_ROOT/cmdline-tools"
# Le zip crée un dossier 'cmdline-tools' qu'on rename en 'latest'
mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest" 2>/dev/null || true

echo "✅ Acceptation des licences..."
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1 || true

echo "📱 Installation des composants Android..."
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

echo ""
echo "✅ Android SDK installé dans: $ANDROID_SDK_ROOT"
echo ""
echo "Ajoutez ces lignes dans votre ~/.zshrc :"
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"'
echo 'export PATH="$PATH:$ANDROID_HOME/platform-tools"'
