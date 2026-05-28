#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$PROJECT_DIR/output/deploy"
RELEASE_DIR="$OUT_DIR/makao-release"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/backend" "$RELEASE_DIR/frontend" "$RELEASE_DIR/deploy"

cp -a "$PROJECT_DIR/backend/GameEngine.js" \
  "$PROJECT_DIR/backend/RoomManager.js" \
  "$PROJECT_DIR/backend/server.js" \
  "$PROJECT_DIR/backend/package.json" \
  "$PROJECT_DIR/backend/package-lock.json" \
  "$RELEASE_DIR/backend/"

# backend/shared is a symlink in the repo. Copy the real files for production.
cp -a "$PROJECT_DIR/shared" "$RELEASE_DIR/backend/shared"

cp -a "$PROJECT_DIR/frontend/dist/." "$RELEASE_DIR/frontend/"
cp -a "$PROJECT_DIR/deploy/." "$RELEASE_DIR/deploy/"

tar -C "$OUT_DIR" -czf "$OUT_DIR/makao-release.tar.gz" makao-release
ls -lh "$OUT_DIR/makao-release.tar.gz"
