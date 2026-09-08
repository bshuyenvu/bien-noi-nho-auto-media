#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"
HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-40}"
HEALTH_SLEEP_SECONDS="${DEPLOY_HEALTH_SLEEP_SECONDS:-3}"
ROLLBACK_KEEP="${DEPLOY_KEEP_ROLLBACK_IMAGES:-3}"
STRICT_CHECK="${DEPLOY_STRICT_CHECK:-false}"
STATE_DIR="$ROOT/data/deployments"
STATE_FILE="${DEPLOY_STATE_FILE:-$STATE_DIR/latest.env}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NEW_SERVICE_STARTED=false
ROLLBACK_AVAILABLE=false

mkdir -p "$STATE_DIR" "$ROOT/data" "$ROOT/output" "$ROOT/backups"

for cmd in git docker curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "[deploy] ERROR: missing command: $cmd" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "[deploy] ERROR: Docker Compose v2 is required" >&2; exit 1; }
[[ -f .env ]] || { echo "[deploy] ERROR: .env not found. Copy .env.example and configure server-only secrets first." >&2; exit 1; }

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy] ERROR: tracked working-tree changes detected; commit/stash them before production deploy." >&2
  exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
OLD_IMAGE_ID="$(docker image inspect bien-noi-nho-auto-media:current --format '{{.Id}}' 2>/dev/null || true)"
if [[ -z "$OLD_IMAGE_ID" ]]; then
  OLD_IMAGE_ID="$(docker compose images -q auto-media 2>/dev/null | head -n 1 || true)"
fi
ROLLBACK_IMAGE=""
if [[ -n "$OLD_IMAGE_ID" ]]; then
  ROLLBACK_IMAGE="bien-noi-nho-auto-media:rollback-$STAMP"
  docker image tag "$OLD_IMAGE_ID" "$ROLLBACK_IMAGE"
  ROLLBACK_AVAILABLE=true
  echo "[deploy] Preserved previous image as $ROLLBACK_IMAGE"
else
  echo "[deploy] WARNING: no previous image found; automatic image rollback is unavailable for this first deployment."
fi

echo "[deploy] Creating pre-deploy SQLite backup..."
BACKUP_DIR="$(bash scripts/backup-wyse.sh | tail -n 1)"
[[ -d "$BACKUP_DIR" ]] || { echo "[deploy] ERROR: backup directory was not created" >&2; exit 1; }

git fetch --prune origin main
git switch main >/dev/null 2>&1 || git checkout main
git pull --ff-only origin main
TARGET_COMMIT="$(git rev-parse HEAD)"

write_state(){
  {
    printf 'DEPLOY_TIMESTAMP=%q\n' "$STAMP"
    printf 'PREVIOUS_COMMIT=%q\n' "$PREVIOUS_COMMIT"
    printf 'TARGET_COMMIT=%q\n' "$TARGET_COMMIT"
    printf 'ROLLBACK_IMAGE=%q\n' "$ROLLBACK_IMAGE"
    printf 'BACKUP_DIR=%q\n' "$BACKUP_DIR"
    printf 'HEALTH_URL=%q\n' "$HEALTH_URL"
  } > "$STATE_FILE"
}
write_state

rollback_on_error(){
  local code="$1"
  trap - ERR
  if [[ "$NEW_SERVICE_STARTED" == "true" && "$ROLLBACK_AVAILABLE" == "true" ]]; then
    echo "[deploy] Deployment failed after service replacement; starting automatic rollback..." >&2
    set +e
    DEPLOY_HEALTH_URL="$HEALTH_URL" DEPLOY_STATE_FILE="$STATE_FILE" bash scripts/rollback-wyse.sh --auto
    local rollback_code=$?
    set -e
    if [[ $rollback_code -eq 0 ]]; then
      echo "[deploy] Automatic rollback completed." >&2
    else
      echo "[deploy] CRITICAL: automatic rollback also failed. Inspect docker compose logs immediately." >&2
    fi
  elif [[ "$NEW_SERVICE_STARTED" == "true" ]]; then
    echo "[deploy] Deployment failed and no previous image is available for automatic rollback." >&2
  fi
  echo "[deploy] Pre-deploy database backup: $BACKUP_DIR" >&2
  exit "$code"
}
trap 'rollback_on_error $?' ERR

echo "[deploy] Building production image for commit $TARGET_COMMIT..."
APP_IMAGE_TAG=current docker compose build --pull auto-media

NEW_SERVICE_STARTED=true
echo "[deploy] Recreating auto-media container..."
APP_IMAGE_TAG=current docker compose up -d --no-build --force-recreate auto-media

healthy=false
for ((attempt=1; attempt<=HEALTH_RETRIES; attempt++)); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  echo "[deploy] Waiting for health ($attempt/$HEALTH_RETRIES)..."
  sleep "$HEALTH_SLEEP_SECONDS"
done
[[ "$healthy" == "true" ]] || { echo "[deploy] ERROR: health check failed: $HEALTH_URL" >&2; false; }

echo "[deploy] Running in-container production readiness check..."
docker compose exec -T -e PROD_CHECK_STRICT="$STRICT_CHECK" auto-media npm run prod:check

cat > "$STATE_DIR/last-success.env" <<EOF
DEPLOYED_AT=$STAMP
ACTIVE_COMMIT=$TARGET_COMMIT
PREVIOUS_COMMIT=$PREVIOUS_COMMIT
ROLLBACK_IMAGE=$ROLLBACK_IMAGE
BACKUP_DIR=$BACKUP_DIR
EOF
rm -f "$STATE_DIR/rollback-active.env"

if [[ "$ROLLBACK_KEEP" =~ ^[0-9]+$ ]] && (( ROLLBACK_KEEP > 0 )); then
  mapfile -t rollback_tags < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep '^bien-noi-nho-auto-media:rollback-' | sort -r || true)
  if (( ${#rollback_tags[@]} > ROLLBACK_KEEP )); then
    for image in "${rollback_tags[@]:ROLLBACK_KEEP}"; do docker image rm "$image" >/dev/null 2>&1 || true; done
  fi
fi

trap - ERR

echo "[deploy] SUCCESS: commit $TARGET_COMMIT is healthy."
echo "[deploy] Backup: $BACKUP_DIR"
[[ -n "$ROLLBACK_IMAGE" ]] && echo "[deploy] Rollback image retained: $ROLLBACK_IMAGE"
