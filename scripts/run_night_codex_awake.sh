#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/villains/Dokumenty/MAKAO}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/output/night-codex}"

mkdir -p "$LOG_DIR"

if ! command -v systemd-inhibit >/dev/null 2>&1; then
  echo "systemd-inhibit is not available; cannot block system sleep safely." >&2
  exit 1
fi

exec systemd-inhibit \
  --what=sleep:idle \
  --who="Codex Makao night runner" \
  --why="Running autonomous Makao development and Android verification" \
  --mode=block \
  "$PROJECT_DIR/scripts/night_codex_loop.sh"
