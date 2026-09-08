#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"
HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-40}"
HEALTH_SLEEP_SECONDS="${DEPLOY_HEALTH_SLEEP_SECONDS:-3}"
ROLLBACK_KEEP="${DEPLOY_KEEP_ROLLBACK_IMAGES:-3}"
STRICT_CHECK="${DEPLOY_STRICT_CHECK:-false}"
MAINTENANCE_MINUTES="${DEPLOY_MAINTENANCE_MINUTES:-30}"
STATE_DIR="$ROOT/data/deployments"
STATE_FILE="${DEPLOY_STATE_FILE:-$STATE_DIR/latest.env}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NEW_SERVICE_STARTED=false
ROLLBACK_AVAILABLE=false
MAINTENANCE_STARTED=false

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

maintenance_api(){
  local action="$1"
  docker compose ps --status running --services 2>/dev/null | grep -qx 'auto-media' || return 5
  docker compose exec -T \
    -e MAINT_ACTION="$action" \
    -e DEPLOY_MAINTENANCE_MINUTES="$MAINTENANCE_MINUTES" \
    -e DEPLOY_MAINTENANCE_REASON="Automated production deploy" \
    auto-media node --input-type=module -e '
      const key=String(process.env.RENDER_API_KEY||"");
      if(!key)process.exit(4);
      const start=process.env.MAINT_ACTION==="start";
      const r=await fetch("http://127.0.0.1:8787/api/admin/monitoring/maintenance",{
        method:start?"POST":"DELETE",
        headers:{authorization:`Bearer ${key}`,...(start?{"content-type":"application/json"}:{})},
        ...(start?{body:JSON.stringify({minutes:Number(process.env.DEPLOY_MAINTENANCE_MINUTES||30),reason:process.env.DEPLOY_MAINTENANCE_REASON||"Automated production deploy"})}:{})
      });
      if(r.status===404)process.exit(3);
      if(!r.ok)process.exit(1);
    '
}

if maintenance_api start; then
  MAINTENANCE_STARTED=true
  echo "[deploy] Maintenance window enabled for up to ${MAINTENANCE_MINUTES} minutes."
else
  maint_code=$?
  case "$maint_code" in
    3) echo "[deploy] Maintenance API not available on current version; continuing without deploy silence." ;;
    4) echo "[deploy] RENDER_API_KEY unavailable in running container; continuing without deploy silence." ;;
    5) echo "[deploy] No running auto-media container; maintenance window not required." ;;
    *) echo "[deploy] WARNING: could not enable maintenance window; continuing deploy." >&2 ;;
  esac
fi

CHECKOUT_COMMIT="$(git rev-parse HEAD)"
OLD_IMAGE_ID="$(docker image inspect bien-noi-nho-auto-media:current --format '{{.Id}}' 2>/dev/null || true)"
if [[ -z "$OLD_IMAGE_ID" ]]; then
  OLD_IMAGE_ID="$(docker compose images -q auto-media 2>/dev/null | head -n 1 || true)"
fi
PREVIOUS_COMMIT="$CHECKOUT_COMMIT"
if [[ -n "$OLD_IMAGE_ID" ]]; then
  image_revision="$(docker image inspect "$OLD_IMAGE_ID" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
  if [[ -n "$image_revision" && "$image_revision" != "unknown" && "$image_revision" != "<no value>" ]]; then
    PREVIOUS_COMMIT="$image_revision"
  fi
fi

ROLLBACK_IMAGE=""
if [[ -n "$OLD_IMAGE_ID" ]]; then
  ROLLBACK_IMAGE="bien-noi-nho-auto-media:rollback-$STAMP"
  docker image tag "$OLD_IMAGE_ID" "$ROLLBACK_IMAGE"
  ROLLBACK_AVAILABLE=true
  echo "[deploy] Preserved previous image as $ROLLBACK_IMAGE (revision $PREVIOUS_COMMIT)"
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
      if [[ "$MAINTENANCE_STARTED" == "true" ]]; then maintenance_api end >/dev/null 2>&1 || true; fi
    else
      echo "[deploy] CRITICAL: automatic rollback also failed. Inspect docker compose logs immediately." >&2
    fi
  elif [[ "$NEW_SERVICE_STARTED" == "true" ]]; then
    echo "[deploy] Deployment failed and no previous image is available for automatic rollback." >&2
  fi
  echo "[deploy] Pre-deploy database backup: $BACKUP_DIR" >&2
  if [[ "$MAINTENANCE_STARTED" == "true" ]]; then echo "[deploy] Maintenance auto-expires after ${MAINTENANCE_MINUTES} minutes if it could not be cleared." >&2; fi
  exit "$code"
}
trap 'rollback_on_error $?' ERR

echo "[deploy] Building production image for commit $TARGET_COMMIT..."
APP_REVISION="$TARGET_COMMIT" APP_IMAGE_TAG=current docker compose build --pull auto-media

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

if [[ "$MAINTENANCE_STARTED" == "true" ]]; then
  if maintenance_api end; then echo "[deploy] Maintenance window ended.";else echo "[deploy] WARNING: maintenance window could not be cleared; it will auto-expire." >&2; fi
fi

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
