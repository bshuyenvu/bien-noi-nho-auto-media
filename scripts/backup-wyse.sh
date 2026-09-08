#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
DB_HOST_PATH="${DB_HOST_PATH:-$ROOT/data/auto-media.sqlite}"
STAGING_HOST="$ROOT/data/.auto-media-backup-$STAMP.sqlite"
STAGING_CONTAINER="/app/data/.auto-media-backup-$STAMP.sqlite"
mkdir -p "$BACKUP_DIR" "$ROOT/data"

commit="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
mode="none"
container_id="$(docker compose ps -q auto-media 2>/dev/null || true)"
running="false"
if [[ -n "$container_id" ]]; then
  running="$(docker inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || true)"
fi

cleanup_staging(){ rm -f "$STAGING_HOST"; }
trap cleanup_staging EXIT

if [[ "$running" == "true" ]]; then
  echo "[backup] Creating online SQLite snapshot with VACUUM INTO..."
  docker compose exec -T auto-media node scripts/sqlite-backup.mjs "$STAGING_CONTAINER" >/dev/null
  if [[ ! -s "$STAGING_HOST" ]]; then
    echo "[backup] ERROR: online snapshot was not created" >&2
    exit 1
  fi
  mv "$STAGING_HOST" "$BACKUP_DIR/auto-media.sqlite"
  mode="online-vacuum"
elif [[ -f "$DB_HOST_PATH" ]]; then
  echo "[backup] App is stopped; copying SQLite database and any WAL sidecars..."
  cp -a "$DB_HOST_PATH" "$BACKUP_DIR/auto-media.sqlite"
  [[ -f "$DB_HOST_PATH-wal" ]] && cp -a "$DB_HOST_PATH-wal" "$BACKUP_DIR/auto-media.sqlite-wal"
  [[ -f "$DB_HOST_PATH-shm" ]] && cp -a "$DB_HOST_PATH-shm" "$BACKUP_DIR/auto-media.sqlite-shm"
  mode="offline-copy"
else
  echo "[backup] No SQLite database exists yet; recording metadata-only backup."
fi

cat > "$BACKUP_DIR/metadata.env" <<EOF
BACKUP_TIMESTAMP=$STAMP
BACKUP_MODE=$mode
SOURCE_COMMIT=$commit
SOURCE_DB=$DB_HOST_PATH
EOF

(
  cd "$BACKUP_DIR"
  files=(auto-media.sqlite auto-media.sqlite-wal auto-media.sqlite-shm metadata.env)
  existing=()
  for file in "${files[@]}"; do [[ -f "$file" ]] && existing+=("$file"); done
  sha256sum "${existing[@]}" > SHA256SUMS
)

ln -sfn "$BACKUP_DIR" "$BACKUP_ROOT/latest"

if [[ "$BACKUP_RETENTION_COUNT" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_COUNT > 0 )); then
  mapfile -t old_backups < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' -printf '%f\n' | sort -r | tail -n +$((BACKUP_RETENTION_COUNT+1)))
  for old in "${old_backups[@]}"; do rm -rf -- "$BACKUP_ROOT/$old"; done
fi

echo "[backup] OK: $BACKUP_DIR"
printf '%s\n' "$BACKUP_DIR"
