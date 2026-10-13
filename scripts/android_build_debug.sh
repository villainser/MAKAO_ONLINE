#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
SERVER_URL="${1:-${VITE_SERVER_URL:-}}"

if [ -z "$SERVER_URL" ]; then
  LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
  SERVER_URL="http://${LAN_IP:-127.0.0.1}:3001"
fi

export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"
export VITE_SERVER_URL="$SERVER_URL"

echo "Building Makao Android debug APK"
echo "Backend URL baked into APK: $VITE_SERVER_URL"

cd "$PROJECT_DIR/frontend"
npm run android:sync

cd "$PROJECT_DIR/frontend/android"
if [ -n "${JAVA_HOME:-}" ]; then
  ./gradlew -Dorg.gradle.java.home="$JAVA_HOME" assembleDebug
else
  ./gradlew assembleDebug
fi

echo
echo "APK:"
APK="$("$PROJECT_DIR/scripts/android_apk_path.sh" debug)"
if [ ! -f "$APK" ]; then
  echo "Versioned APK was not created: $APK" >&2
  exit 1
fi
ls -lh "$APK"
