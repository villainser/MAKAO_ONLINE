#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
AVD_NAME="${1:-Makao_API_33}"
MODE="${2:-headless}"

export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

ACCEL_ARGS=()
if [ ! -e /dev/kvm ]; then
  ACCEL_ARGS=(-accel off)
fi

DISPLAY_ARGS=()
if [ "$MODE" = "headless" ]; then
  DISPLAY_ARGS=(-no-window -no-audio)
fi

echo "Starting AVD $AVD_NAME"
if [ ! -e /dev/kvm ]; then
  echo "Warning: /dev/kvm missing; boot can be very slow. Enable SVM/AMD-V in BIOS/UEFI for normal speed."
fi

exec emulator \
  -avd "$AVD_NAME" \
  "${ACCEL_ARGS[@]}" \
  "${DISPLAY_ARGS[@]}" \
  -no-snapshot-save \
  -no-boot-anim \
  -gpu swiftshader_indirect
