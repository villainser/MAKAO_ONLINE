#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_FILE="$PROJECT_DIR/frontend/android/version.properties"
BUILD_TYPE="${1:-debug}"

case "$BUILD_TYPE" in
  debug|release) ;;
  *)
    echo "Unsupported Android build type: $BUILD_TYPE" >&2
    exit 2
    ;;
esac

if [ ! -f "$VERSION_FILE" ]; then
  echo "Missing Android version file: $VERSION_FILE" >&2
  exit 1
fi

VERSION_CODE="$(awk -F= '$1 == "VERSION_CODE" { print $2; exit }' "$VERSION_FILE" | tr -d '[:space:]')"
VERSION_NAME="$(awk -F= '$1 == "VERSION_NAME" { print $2; exit }' "$VERSION_FILE" | tr -d '[:space:]')"

if [[ ! "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]]; then
  echo "Invalid VERSION_CODE in $VERSION_FILE" >&2
  exit 1
fi
if [[ ! "$VERSION_NAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid VERSION_NAME in $VERSION_FILE" >&2
  exit 1
fi

printf '%s/frontend/android/app/build/outputs/apk/%s/Makao-v%s-build%s-%s.apk\n' \
  "$PROJECT_DIR" "$BUILD_TYPE" "$VERSION_NAME" "$VERSION_CODE" "$BUILD_TYPE"
