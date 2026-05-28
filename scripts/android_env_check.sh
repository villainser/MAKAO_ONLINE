#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"

export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

echo "Project: $PROJECT_DIR"
echo "ANDROID_SDK_ROOT: $ANDROID_SDK_ROOT"
echo

echo "Tools:"
command -v adb || true
command -v sdkmanager || true
command -v avdmanager || true
command -v emulator || true
echo

echo "KVM:"
if [ -e /dev/kvm ]; then
  ls -l /dev/kvm
else
  echo "/dev/kvm missing - emulator will need software acceleration or BIOS/UEFI SVM enabled"
fi
emulator -accel-check || true
echo

echo "Installed Android SDK packages:"
sdkmanager --list_installed | grep -E "platform-tools|build-tools|platforms;android-33|platforms;android-3[4-6]|emulator|system-images;android-33" || true
echo

echo "AVDs:"
avdmanager list avd || true
echo

echo "ADB devices:"
adb devices -l || true
