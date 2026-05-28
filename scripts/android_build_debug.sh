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
./gradlew assembleDebug

echo
echo "APK:"
ls -lh "$PROJECT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
