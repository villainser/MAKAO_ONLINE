#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
PACKAGE_NAME="pl.makao.zeznajomymi"
ACTIVITY_NAME="$PACKAGE_NAME/.MakaoNativeActivity"
SERVER_URL="http://127.0.0.1:9"
SCENARIOS="ace_request_panel,jack_request_panel,joker_declaration_panel,own_missing_makao,opponent_catch_makao,opponent_play_history,opponent_draw_history,opponent_penalty_history,opponent_skip_history,opponent_catch_history,opponent_request_pass_history,opponent_request_resolve_history,badge_suit_request,badge_rank_request,badge_draw_penalty,badge_warsaw_queen_penalty,badge_skip_turn,badge_joker_context,local_draw_from_deck,local_throw_to_stack,manual_throw_gesture,multi_opponent_table,multi_opponent_bubbles,hand_focus_reveal,hand_idle_peek,sort_hand"
WAIT_SEC="5"
OUT_DIR=""
SKIP_BUILD=0
SKIP_INSTALL=0
WITH_INTERACTIONS=0

usage() {
  cat <<'EOF'
Usage: scripts/android_debug_scenarios_smoke.sh [options]

Options:
  --server-url URL     Server URL passed to the native activity. Default: http://127.0.0.1:9
  --scenarios CSV     Comma-separated debugScenario list.
  --out-dir DIR       Output directory. Default: output/android-smoke/native-debug-scenarios-<stamp>-<device>
  --wait-sec N        Seconds to wait after each launch before screenshot. Default: 5
  --skip-build        Reuse existing APK.
  --skip-install      Do not reinstall APK.
  --with-interactions Also run deterministic tap/double-tap checks after baseline screenshots.
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
    --out-dir)
      OUT_DIR="${2:?Missing value for --out-dir}"
      shift 2
      ;;
    --wait-sec)
      WAIT_SEC="${2:?Missing value for --wait-sec}"
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
    --with-interactions)
      WITH_INTERACTIONS=1
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
  OUT_DIR="$PROJECT_DIR/output/android-smoke/native-debug-scenarios-$STAMP-${DEVICE_ID:-device}"
fi
mkdir -p "$OUT_DIR"

APK="$PROJECT_DIR/frontend/android/app/build/outputs/apk/debug/app-debug.apk"
SUMMARY_FILE="$OUT_DIR/summary.txt"
ERROR_PATTERN='FATAL EXCEPTION| E AndroidRuntime|UnsatisfiedLinkError|ClassNotFoundException|NoClassDefFoundError|NullPointerException|SecurityException|ANR|Mixed Content|TypeError|ReferenceError|ERR_'

echo "Device: ${DEVICE_ID:-unknown}" | tee "$SUMMARY_FILE"
echo "Server URL: $SERVER_URL" | tee -a "$SUMMARY_FILE"
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

assert_png() {
  local file_path="$1"
  if [ ! -s "$file_path" ]; then
    echo "FAIL: screenshot missing or empty: $file_path" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  if ! file "$file_path" | grep -q "PNG image data"; then
    echo "FAIL: screenshot is not PNG: $file_path" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  local size_bytes
  size_bytes="$(wc -c < "$file_path")"
  if [ "$size_bytes" -lt 20000 ]; then
    echo "FAIL: screenshot is suspiciously small (${size_bytes} bytes): $file_path" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  if command -v magick >/dev/null 2>&1; then
    local stats mean deviation
    stats="$(magick "$file_path" -resize 64x64\! -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]' info: 2>/dev/null || true)"
    mean="${stats%% *}"
    deviation="${stats##* }"
    if [ -n "$mean" ] && [ -n "$deviation" ] \
      && awk -v mean="$mean" -v deviation="$deviation" 'BEGIN { exit !((mean < 0.018) || (deviation < 0.0025)) }'; then
      echo "FAIL: screenshot appears black/blank (mean=$mean deviation=$deviation): $file_path" | tee -a "$SUMMARY_FILE"
      return 1
    fi
  fi
}

assert_crop_changed() {
  local before_name="$1"
  local after_name="$2"
  local geometry="$3"
  local label="$4"
  local min_mean="$5"
  local before_file="$OUT_DIR/$before_name"
  local after_file="$OUT_DIR/$after_name"
  if [ ! -f "$before_file" ] || [ ! -f "$after_file" ]; then
    echo "WARN: skipped crop assertion for $label; missing baseline or interaction screenshot" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  if ! command -v magick >/dev/null 2>&1; then
    echo "WARN: skipped crop assertion for $label; ImageMagick unavailable" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  local mean
  mean="$(magick "$before_file" "$after_file" -compose Difference -composite -crop "$geometry" -colorspace Gray -format '%[fx:mean]' info: 2>/dev/null || true)"
  if [ -z "$mean" ] || ! awk -v mean="$mean" -v min="$min_mean" 'BEGIN { exit !(mean >= min) }'; then
    echo "FAIL: crop assertion failed for $label (mean=${mean:-missing}, min=$min_mean, crop=$geometry)" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  echo "PASS: crop assertion $label (mean=$mean)" | tee -a "$SUMMARY_FILE"
}

assert_crop_not_blank() {
  local file_name="$1"
  local geometry="$2"
  local label="$3"
  local min_mean="$4"
  local min_deviation="$5"
  local file_path="$OUT_DIR/$file_name"
  if [ ! -f "$file_path" ]; then
    echo "WARN: skipped crop assertion for $label; missing screenshot" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  if ! command -v magick >/dev/null 2>&1; then
    echo "WARN: skipped crop assertion for $label; ImageMagick unavailable" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  local stats mean deviation
  stats="$(magick "$file_path" -crop "$geometry" -resize 64x64\! -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]' info: 2>/dev/null || true)"
  mean="${stats%% *}"
  deviation="${stats##* }"
  if [ -z "$mean" ] || [ -z "$deviation" ] \
    || ! awk -v mean="$mean" -v deviation="$deviation" -v min_mean="$min_mean" -v min_deviation="$min_deviation" \
      'BEGIN { exit !((mean >= min_mean) && (deviation >= min_deviation)) }'; then
    echo "FAIL: crop assertion failed for $label (mean=${mean:-missing}, deviation=${deviation:-missing}, crop=$geometry)" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  echo "PASS: crop assertion $label (mean=$mean deviation=$deviation)" | tee -a "$SUMMARY_FILE"
}

assert_crop_has_dark_panel() {
  local file_name="$1"
  local geometry="$2"
  local label="$3"
  local min_dark="$4"
  local min_deviation="$5"
  local file_path="$OUT_DIR/$file_name"
  if [ ! -f "$file_path" ]; then
    echo "WARN: skipped crop assertion for $label; missing screenshot" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  if ! command -v magick >/dev/null 2>&1; then
    echo "WARN: skipped crop assertion for $label; ImageMagick unavailable" | tee -a "$SUMMARY_FILE"
    return 0
  fi
  local dark_fraction deviation
  dark_fraction="$(magick "$file_path" -crop "$geometry" -colorspace Gray -threshold 10% -format '%[fx:1-mean]' info: 2>/dev/null || true)"
  deviation="$(magick "$file_path" -crop "$geometry" -resize 64x64\! -colorspace Gray -format '%[fx:standard_deviation]' info: 2>/dev/null || true)"
  if [ -z "$dark_fraction" ] || [ -z "$deviation" ] \
    || ! awk -v dark="$dark_fraction" -v deviation="$deviation" -v min_dark="$min_dark" -v min_deviation="$min_deviation" \
      'BEGIN { exit !((dark >= min_dark) && (deviation >= min_deviation)) }'; then
    echo "FAIL: crop assertion failed for $label (dark=${dark_fraction:-missing}, deviation=${deviation:-missing}, crop=$geometry)" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  echo "PASS: crop assertion $label (dark=$dark_fraction deviation=$deviation)" | tee -a "$SUMMARY_FILE"
}

capture_log_and_screen() {
  local name="$1"
  local log_file="$OUT_DIR/logcat-$name.txt"
  local screen_file="$OUT_DIR/$name.png"

  wake_device
  adb logcat -d > "$log_file"
  adb exec-out screencap -p > "$screen_file"
  assert_process_running
  assert_png "$screen_file"

  if rg -n "$ERROR_PATTERN" "$log_file" | rg -v 'HCI_ERR_PAGE_TIMEOUT|ERR_PAGE_TIMEOUT' > "$OUT_DIR/errors-$name.txt"; then
    echo "FAIL: app-level error pattern found in logcat-$name.txt" | tee -a "$SUMMARY_FILE"
    return 1
  fi
  rm -f "$OUT_DIR/errors-$name.txt"
  echo "PASS: $name" | tee -a "$SUMMARY_FILE"
}

launch_scenario() {
  local scenario="$1"
  wake_device
  adb logcat -c || true
  adb shell am start -S -n "$ACTIVITY_NAME" \
    --es debugScenario "$scenario" \
    --es serverUrl "$SERVER_URL" \
    --es playerName Codex >/dev/null
  sleep "$WAIT_SEC"
  capture_log_and_screen "$scenario"
}

launch_for_interaction() {
  local scenario="$1"
  wake_device
  adb logcat -c || true
  adb shell am start -S -n "$ACTIVITY_NAME" \
    --es debugScenario "$scenario" \
    --es serverUrl "$SERVER_URL" \
    --es playerName Codex >/dev/null
  sleep "$WAIT_SEC"
}

tap_and_capture() {
  local scenario="$1"
  local name="$2"
  local x="$3"
  local y="$4"
  launch_for_interaction "$scenario"
  adb shell input tap "$x" "$y"
  sleep 1
  capture_log_and_screen "$name"
}

double_tap_and_capture() {
  local scenario="$1"
  local name="$2"
  local x="$3"
  local y="$4"
  launch_for_interaction "$scenario"
  adb shell "input tap $x $y; sleep 0.2; input tap $x $y"
  sleep 1
  capture_log_and_screen "$name"
}

swipe_and_capture() {
  local scenario="$1"
  local name="$2"
  local x1="$3"
  local y1="$4"
  local x2="$5"
  local y2="$6"
  local duration_ms="$7"
  launch_for_interaction "$scenario"
  adb shell input swipe "$x1" "$y1" "$x2" "$y2" "$duration_ms"
  sleep 2
  capture_log_and_screen "$name"
}

run_interaction_checks() {
  echo "Running interaction checks" | tee -a "$SUMMARY_FILE"
  tap_and_capture "ace_request_panel" "interaction-ace-outside-cancel" 640 193
  tap_and_capture "ace_request_panel" "interaction-ace-select-spades" 633 137
  tap_and_capture "jack_request_panel" "interaction-jack-select-10" 679 137
  tap_and_capture "joker_declaration_panel" "interaction-joker-ok" 956 268
  tap_and_capture "own_missing_makao" "interaction-own-makao" 1012 469
  tap_and_capture "opponent_catch_makao" "interaction-catch-zlap" 708 176
  tap_and_capture "hand_focus_reveal" "interaction-hand-focus-expand" 640 597
  tap_and_capture "hand_idle_peek" "interaction-hand-idle-peek-expand" 640 597
  swipe_and_capture "manual_throw_gesture" "interaction-manual-throw-controlled" 544 597 867 315 700
  double_tap_and_capture "sort_hand" "interaction-double-tap-sort" 640 597
  assert_crop_changed "own_missing_makao.png" "interaction-own-makao.png" "220x90+900+410" "MAKAO disappears after declare" "0.05"
  assert_crop_changed "opponent_catch_makao.png" "interaction-catch-zlap.png" "220x100+610+120" "ZLAP disappears after catch" "0.015"
  assert_crop_changed "ace_request_panel.png" "interaction-ace-select-spades.png" "520x160+360+60" "request panel disappears after choice" "0.03"
  assert_crop_changed "hand_focus_reveal.png" "interaction-hand-focus-expand.png" "760x180+260+510" "hand reveal expands after touch" "0.04"
  assert_crop_changed "hand_idle_peek.png" "interaction-hand-idle-peek-expand.png" "760x180+260+510" "idle hand peek expands after touch" "0.04"
  assert_crop_changed "manual_throw_gesture.png" "interaction-manual-throw-controlled.png" "220x230+700+190" "manual drag throw changes discard stack" "0.012"
  assert_crop_not_blank "opponent_play_history.png" "140x140+690+235" "discard undercard region visible" "0.7" "0.04"
}

run_table_crop_assertions() {
  echo "Running table crop assertions" | tee -a "$SUMMARY_FILE"

  local badge_crop="300x90+900+135"
  assert_crop_has_dark_panel "badge_suit_request.png" "$badge_crop" "suit request table badge" "0.45" "0.075"
  assert_crop_has_dark_panel "badge_rank_request.png" "$badge_crop" "rank request table badge" "0.45" "0.075"
  assert_crop_has_dark_panel "badge_draw_penalty.png" "$badge_crop" "draw penalty table badge" "0.40" "0.07"
  assert_crop_has_dark_panel "badge_warsaw_queen_penalty.png" "$badge_crop" "Warsaw queen draw penalty table badge" "0.40" "0.07"
  assert_crop_has_dark_panel "badge_skip_turn.png" "$badge_crop" "pause/4 table badge" "0.45" "0.075"
  assert_crop_has_dark_panel "badge_joker_context.png" "$badge_crop" "Joker context table badge" "0.43" "0.075"

  local side_bubble_crop="340x70+25+145"
  local top_bubble_crop="380x75+455+80"
  local left_top_bubble_crop="390x75+25+80"
  assert_crop_has_dark_panel "opponent_play_history.png" "$side_bubble_crop" "opponent play event bubble" "0.45" "0.07"
  assert_crop_has_dark_panel "opponent_draw_history.png" "$left_top_bubble_crop" "opponent draw event bubble" "0.45" "0.07"
  assert_crop_has_dark_panel "opponent_penalty_history.png" "$side_bubble_crop" "opponent draw-penalty event bubble" "0.40" "0.07"
  assert_crop_has_dark_panel "opponent_skip_history.png" "$left_top_bubble_crop" "opponent pause event bubble" "0.45" "0.07"
  assert_crop_has_dark_panel "opponent_catch_history.png" "$side_bubble_crop" "opponent catch event bubble" "0.45" "0.07"
  assert_crop_has_dark_panel "opponent_request_pass_history.png" "320x75+25+115" "opponent request-pass event bubble" "0.35" "0.07"
  assert_crop_has_dark_panel "opponent_request_resolve_history.png" "340x75+25+72" "opponent request-resolved event bubble" "0.35" "0.07"
  assert_crop_has_dark_panel "multi_opponent_bubbles.png" "340x80+25+145" "multi-opponent left bubble lane" "0.45" "0.07"
  assert_crop_has_dark_panel "multi_opponent_bubbles.png" "340x80+25+35" "multi-opponent top bubble lane" "0.30" "0.07"
  assert_crop_has_dark_panel "multi_opponent_bubbles.png" "340x80+910+145" "multi-opponent right bubble lane" "0.30" "0.07"
}

IFS=',' read -r -a SCENARIO_LIST <<< "$SCENARIOS"
for scenario in "${SCENARIO_LIST[@]}"; do
  scenario="$(echo "$scenario" | xargs)"
  if [ -n "$scenario" ]; then
    launch_scenario "$scenario"
  fi
done

adb logcat -c || true
adb shell am start -S -n "$ACTIVITY_NAME" \
  --es serverUrl "$SERVER_URL" \
  --es playerName Codex >/dev/null
sleep "$WAIT_SEC"
capture_log_and_screen "normal-no-debug"

run_table_crop_assertions

if [ "$WITH_INTERACTIONS" -eq 1 ]; then
  run_interaction_checks
fi

echo "DONE: $OUT_DIR" | tee -a "$SUMMARY_FILE"
