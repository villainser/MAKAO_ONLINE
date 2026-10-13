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

APK="$("$PROJECT_DIR/scripts/android_apk_path.sh" debug)"

echo "Installing $APK"
adb install -r "$APK"
# Android's package-update UI can briefly resume the previous app task after
# adb returns. Let that lifecycle transition finish before the measured launch.
sleep 2

echo "Waking device and launching a clean app task"
adb shell input keyevent KEYCODE_WAKEUP || true
adb shell wm dismiss-keyguard || true
adb shell input keyevent 82 || true
adb shell am force-stop "$PACKAGE_NAME"

echo "Clearing old logcat"
adb logcat -c || true
LOGCAT_SINCE="$(adb shell "date '+%m-%d %H:%M:%S.000'" 2>/dev/null | tr -d '\r')"
adb shell am start -W -n "$PACKAGE_NAME/.MainActivity"

sleep 8
APP_PIDS="$(adb shell pidof "$PACKAGE_NAME" 2>/dev/null | tr -d '\r' || true)"

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/logcat-$STAMP.txt"
SCREEN_FILE="$LOG_DIR/screen-$STAMP.png"
echo "Capturing logcat to $LOG_FILE"
adb logcat -d -v threadtime -T "$LOGCAT_SINCE" \
  | node "$PROJECT_DIR/scripts/android_logcat_filter.mjs" --package "$PACKAGE_NAME" --pids "$APP_PIDS" \
  > "$LOG_FILE"
adb exec-out screencap -p > "$SCREEN_FILE" || true

echo "Smoke result:"
if adb shell pidof "$PACKAGE_NAME" >/dev/null; then
  echo "App process is running"
else
  echo "App process is not running"
fi
ERROR_FILE="$LOG_DIR/errors-$STAMP.txt"
if rg -n 'FATAL EXCEPTION|AndroidRuntime|UnsatisfiedLinkError|ClassNotFoundException|NoClassDefFoundError|NullPointerException|SecurityException|ANR|Mixed Content|TypeError|ReferenceError|ERR_' "$LOG_FILE" \
  | rg -v 'HCI_ERR_PAGE_TIMEOUT|ERR_PAGE_TIMEOUT' > "$ERROR_FILE"; then
  echo "App-level error detected"
  echo "$ERROR_FILE"
  exit 1
fi
rm -f "$ERROR_FILE"
echo "$LOG_FILE"
echo "$SCREEN_FILE"
