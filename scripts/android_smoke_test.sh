#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
SERVER_URL="${1:-${VITE_SERVER_URL:-}}"
PACKAGE_NAME="pl.makao.zeznajomymi"
LOG_DIR="$PROJECT_DIR/output/android-smoke"

if [ -z "$SERVER_URL" ]; then
  LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
  SERVER_URL="http://${LAN_IP:-127.0.0.1}:3001"
fi

export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

mkdir -p "$LOG_DIR"

echo "Checking adb device"
adb wait-for-device
adb devices -l

echo "Building APK for backend: $SERVER_URL"
"$PROJECT_DIR/scripts/android_build_debug.sh" "$SERVER_URL"

APK="$PROJECT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"

echo "Installing $APK"
adb install -r "$APK"

echo "Clearing old logcat and launching app"
adb logcat -c || true
adb shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null

sleep 5

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/logcat-$STAMP.txt"
SCREEN_FILE="$LOG_DIR/screen-$STAMP.png"
echo "Capturing logcat to $LOG_FILE"
adb logcat -d > "$LOG_FILE"
adb exec-out screencap -p > "$SCREEN_FILE" || true

echo "Smoke result:"
if adb shell pidof "$PACKAGE_NAME" >/dev/null; then
  echo "App process is running"
else
  echo "App process is not running"
fi
if grep -q "Mixed Content" "$LOG_FILE"; then
  echo "Mixed content error detected"
fi
echo "$LOG_FILE"
echo "$SCREEN_FILE"
