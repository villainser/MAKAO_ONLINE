#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
PACKAGE_NAME="pl.makao.zeznajomymi"
ACTIVITY_NAME="$PACKAGE_NAME/.MakaoNativeActivity"
SERVER_URL="http://127.0.0.1:9"
SCENARIOS="local_draw_from_deck,local_throw_to_stack,hand_focus_reveal,opponent_play_history,opponent_draw_history,opponent_penalty_history,joker_declaration_panel"
DURATION_SEC="7"
FRAME_FPS="4"
OUT_DIR=""
SKIP_BUILD=0
SKIP_INSTALL=0

usage() {
  cat <<'EOF'
Usage: scripts/android_record_debug_scenarios.sh [options]

Options:
  --server-url URL     Server URL passed to the native activity. Default: http://127.0.0.1:9
  --scenarios CSV     Comma-separated debugScenario list.
  --duration-sec N    Screenrecord duration per scenario. Default: 7
  --frame-fps N       Extracted frame rate. Default: 4
  --out-dir DIR       Output directory. Default: output/android-smoke/native-motion-review-<stamp>-<device>
  --skip-build        Reuse existing APK.
  --skip-install      Do not reinstall APK.
  -h, --help          Show this help.

Set ANDROID_SERIAL=<device-id> when more than one device is connected.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --server-url)
      SERVER_URL="${2:?Missing value for --server-url}"
      shift 2
      ;;
    --scenarios)
      SCENARIOS="${2:?Missing value for --scenarios}"
      shift 2
      ;;
    --duration-sec)
      DURATION_SEC="${2:?Missing value for --duration-sec}"
      shift 2
      ;;
    --frame-fps)
      FRAME_FPS="${2:?Missing value for --frame-fps}"
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

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FAIL: ffmpeg is required to extract review frames" >&2
  exit 1
fi

adb wait-for-device
DEVICE_ID="$(adb get-serialno | tr -cd '[:alnum:]_.-')"
STAMP="$(date +%Y%m%d-%H%M%S)"
if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$PROJECT_DIR/output/android-smoke/native-motion-review-$STAMP-${DEVICE_ID:-device}"
fi
mkdir -p "$OUT_DIR"

APK="$PROJECT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
SUMMARY_FILE="$OUT_DIR/summary.txt"
ERROR_PATTERN='FATAL EXCEPTION| E AndroidRuntime|UnsatisfiedLinkError|ClassNotFoundException|NoClassDefFoundError|NullPointerException|SecurityException|ANR|Mixed Content|TypeError|ReferenceError|ERR_'

echo "Device: ${DEVICE_ID:-unknown}" | tee "$SUMMARY_FILE"
echo "Server URL: $SERVER_URL" | tee -a "$SUMMARY_FILE"
echo "Duration: ${DURATION_SEC}s" | tee -a "$SUMMARY_FILE"
echo "Frame FPS: $FRAME_FPS" | tee -a "$SUMMARY_FILE"
echo "Output: $OUT_DIR" | tee -a "$SUMMARY_FILE"

if [ "$SKIP_BUILD" -eq 0 ]; then
  "$PROJECT_DIR/scripts/android_build_debug.sh" "$SERVER_URL"
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  adb install -r "$APK"
fi

wake_device() {
  adb shell svc power stayon true >/dev/null 2>&1 || true
  adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
  adb shell input keyevent 82 >/dev/null 2>&1 || true
  sleep 1
}

assert_process_running() {
  if ! adb shell pidof "$PACKAGE_NAME" >/dev/null; then
    echo "FAIL: app process is not running" | tee -a "$SUMMARY_FILE"
    return 1
  fi
}

assert_frame_file() {
  local file_path="$1"
  if [ ! -s "$file_path" ]; then
    echo "FAIL: frame missing or empty: $file_path" | tee -a "$SUMMARY_FILE"
    return 1
  fi
}

is_frame_blank() {
  local file_path="$1"
  if command -v magick >/dev/null 2>&1; then
    local stats mean deviation
    stats="$(magick "$file_path" -resize 64x64\! -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]' info: 2>/dev/null || true)"
    mean="${stats%% *}"
    deviation="${stats##* }"
    if [ -n "$mean" ] && [ -n "$deviation" ] \
      && awk -v mean="$mean" -v deviation="$deviation" 'BEGIN { exit !((mean < 0.018) || (deviation < 0.0025)) }'; then
      return 0
    fi
  fi
  return 1
}

motion_min_diff_for_scenario() {
  case "$1" in
    local_draw_from_deck|local_throw_to_stack|hand_focus_reveal|opponent_play_history|opponent_draw_history|opponent_penalty_history|joker_declaration_panel)
      echo "0.006"
      ;;
    *)
      echo "0"
      ;;
  esac
}

assert_motion_frames() {
  local scenario="$1"
  local min_mean="$2"
  local nonblank_count="$3"
  if ! command -v magick >/dev/null 2>&1; then
    echo "WARN: skipped motion assertion for $scenario; ImageMagick unavailable" | tee -a "$SUMMARY_FILE"
    return 0
  fi

  local skip_count=6
  if [ "$nonblank_count" -lt 9 ]; then
    skip_count=2
  fi

  local previous_frame=""
  local seen_nonblank=0
  local compared=0
  local max_mean=0
  local frame diff_mean
  while IFS= read -r frame; do
    if is_frame_blank "$frame"; then
      continue
    fi
    seen_nonblank=$((seen_nonblank + 1))
    if [ "$seen_nonblank" -le "$skip_count" ]; then
      previous_frame="$frame"
      continue
    fi
    if [ -n "$previous_frame" ]; then
      diff_mean="$(magick "$previous_frame" "$frame" -compose Difference -composite -resize 160x90\! -colorspace Gray -format '%[fx:mean]' info: 2>/dev/null || true)"
      if [ -n "$diff_mean" ]; then
        compared=$((compared + 1))
        max_mean="$(awk -v current="$max_mean" -v candidate="$diff_mean" 'BEGIN { print (current > candidate) ? current : candidate }')"
      fi
    fi
    previous_frame="$frame"
  done < <(find "$OUT_DIR" -maxdepth 1 -name "${scenario}-frame-*.png" | sort)

  if [ "$compared" -lt 1 ]; then
    echo "FAIL: too few comparable nonblank frames for motion assertion in $scenario" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  if ! awk -v mean="$max_mean" -v min="$min_mean" 'BEGIN { exit !(mean >= min) }'; then
    echo "FAIL: motion assertion failed for $scenario (max_diff=$max_mean, min=$min_mean)" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  echo "PASS: motion assertion $scenario (max_diff=$max_mean, min=$min_mean, compared=$compared)" | tee -a "$SUMMARY_FILE"
}

record_scenario() {
  local scenario="$1"
  local remote_file="/sdcard/Download/makao-${scenario}-motion.mp4"
  local local_file="$OUT_DIR/${scenario}.mp4"
  local log_file="$OUT_DIR/logcat-${scenario}.txt"
  local frame_pattern="$OUT_DIR/${scenario}-frame-%02d.png"

  wake_device
  adb logcat -c || true
  adb shell rm -f "$remote_file" >/dev/null 2>&1 || true
  adb shell screenrecord --time-limit "$DURATION_SEC" "$remote_file" >/dev/null 2>&1 &
  local record_pid=$!
  sleep 0.35
  adb shell am start -S -n "$ACTIVITY_NAME" \
    --es debugScenario "$scenario" \
    --es serverUrl "$SERVER_URL" \
    --es playerName Codex >/dev/null
  wait "$record_pid" || true

  adb logcat -d > "$log_file"
  assert_process_running
  if rg -n "$ERROR_PATTERN" "$log_file" > "$OUT_DIR/errors-${scenario}.txt"; then
    echo "FAIL: app-level error pattern found in logcat-${scenario}.txt" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  rm -f "$OUT_DIR/errors-${scenario}.txt"

  adb pull "$remote_file" "$local_file" >/dev/null
  adb shell rm -f "$remote_file" >/dev/null 2>&1 || true
  if [ ! -s "$local_file" ]; then
    echo "FAIL: recording missing or empty: $local_file" | tee -a "$SUMMARY_FILE"
    return 1
  fi

  ffmpeg -hide_banner -loglevel error -y -i "$local_file" -vf "fps=${FRAME_FPS},scale=640:-1" "$frame_pattern"
  local frame_count
  frame_count="$(find "$OUT_DIR" -maxdepth 1 -name "${scenario}-frame-*.png" | wc -l)"
  if [ "$frame_count" -lt 2 ]; then
    echo "FAIL: too few extracted frames for $scenario: $frame_count" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  local nonblank_count=0
  while IFS= read -r frame; do
    assert_frame_file "$frame"
    if ! is_frame_blank "$frame"; then
      nonblank_count=$((nonblank_count + 1))
    fi
  done < <(find "$OUT_DIR" -maxdepth 1 -name "${scenario}-frame-*.png" | sort)
  if [ "$nonblank_count" -lt 2 ]; then
    echo "FAIL: too few nonblank frames for $scenario: $nonblank_count of $frame_count" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  local min_motion_diff
  min_motion_diff="$(motion_min_diff_for_scenario "$scenario")"
  if awk -v min="$min_motion_diff" 'BEGIN { exit !(min > 0) }'; then
    assert_motion_frames "$scenario" "$min_motion_diff" "$nonblank_count"
  fi
  echo "PASS: $scenario ($frame_count frames, $nonblank_count nonblank)" | tee -a "$SUMMARY_FILE"
}

IFS=',' read -r -a SCENARIO_LIST <<< "$SCENARIOS"
for scenario in "${SCENARIO_LIST[@]}"; do
  scenario="$(echo "$scenario" | xargs)"
  if [ -n "$scenario" ]; then
    record_scenario "$scenario"
  fi
done

echo "DONE: $OUT_DIR" | tee -a "$SUMMARY_FILE"
