#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
PORT="${PORT:-3101}"
HOST_IP="${HOST_IP:-}"
OUT_DIR=""
SKIP_BUILD=0
SKIP_INSTALL=0

usage() {
  cat <<'EOF'
Usage: scripts/android_live_two_client_smoke.sh [options]

Runs a local two-client smoke:
  - backend with MAKAO_ENABLE_TEST_HOOKS=1 on a local port,
  - Samsung/native Android client as one player,
  - Node/socket.io driver as the second player.

Options:
  --port N          Local backend port. Default: 3101.
  --host-ip IP     LAN IP reachable by the phone. Auto-detected by default.
  --out-dir DIR    Output directory. Default: output/android-smoke/live-two-client-<stamp>-<device>
  --skip-build     Reuse existing Android APK.
  --skip-install   Do not reinstall APK.
  -h, --help       Show this help.

Set ANDROID_SERIAL=5200df2eee05549b to target the Samsung device explicitly.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      PORT="${2:?Missing value for --port}"
      shift 2
      ;;
    --host-ip)
      HOST_IP="${2:?Missing value for --host-ip}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:?Missing value for --out-dir}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

adb wait-for-device
DEVICE_ID="$(adb get-serialno | tr -cd '[:alnum:]_.-')"
STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$PROJECT_DIR/output/android-smoke/live-two-client-$STAMP-${DEVICE_ID:-device}"
fi
mkdir -p "$OUT_DIR"

if [ -z "$HOST_IP" ]; then
  HOST_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
fi
HOST_IP="${HOST_IP:-127.0.0.1}"
LOCAL_SERVER_URL="http://127.0.0.1:$PORT"
ANDROID_SERVER_URL="http://$HOST_IP:$PORT"
APK="$PROJECT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
SUMMARY_FILE="$OUT_DIR/summary.txt"

{
  echo "Device: ${DEVICE_ID:-unknown}"
  echo "Local server URL: $LOCAL_SERVER_URL"
  echo "Android server URL: $ANDROID_SERVER_URL"
  echo "Output: $OUT_DIR"
} | tee "$SUMMARY_FILE"

if [ "$SKIP_BUILD" -eq 0 ]; then
  "$PROJECT_DIR/scripts/android_build_debug.sh" "$ANDROID_SERVER_URL" | tee "$OUT_DIR/android-build.log"
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  adb install -r "$APK" | tee "$OUT_DIR/adb-install.log"
fi

if timeout 1 bash -c "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
  echo "FAIL: port $PORT is already in use; choose --port N" | tee -a "$SUMMARY_FILE"
  exit 1
fi

(
  cd "$PROJECT_DIR/backend"
  MAKAO_ENABLE_TEST_HOOKS=1 PORT="$PORT" npm start
) > "$OUT_DIR/backend.log" 2>&1 &
BACKEND_PID="$!"

cleanup() {
  if kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if timeout 1 bash -c "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! timeout 1 bash -c "</dev/tcp/127.0.0.1/$PORT" >/dev/null 2>&1; then
  echo "FAIL: backend did not open port $PORT" | tee -a "$SUMMARY_FILE"
  tail -80 "$OUT_DIR/backend.log" | tee -a "$SUMMARY_FILE"
  exit 1
fi

node "$PROJECT_DIR/scripts/live_two_client_smoke.mjs" \
  --server "$LOCAL_SERVER_URL" \
  --android-server "$ANDROID_SERVER_URL" \
  --out-dir "$OUT_DIR" | tee -a "$SUMMARY_FILE"

echo "DONE: $OUT_DIR" | tee -a "$SUMMARY_FILE"
