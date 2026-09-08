#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATE_FILE="${DEPLOY_STATE_FILE:-$ROOT/data/deployments/latest.env}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"
HEALTH_RETRIES="${DEPLOY_HEALTH_RETRIES:-40}"
HEALTH_SLEEP_SECONDS="${DEPLOY_HEALTH_SLEEP_SECONDS:-3}"
AUTO=false
[[ "${1:-}" == "--auto" ]] && AUTO=true

if [[ ! -f "$STATE_FILE" ]]; then
  echo "[rollback] ERROR: deployment state not found: $STATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"
: "${ROLLBACK_IMAGE:?ROLLBACK_IMAGE missing in deployment state}"
: "${PREVIOUS_COMMIT:?PREVIOUS_COMMIT missing in deployment state}"

if ! docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
  echo "[rollback] ERROR: rollback image is missing: $ROLLBACK_IMAGE" >&2
  exit 1
fi

if [[ "$AUTO" != "true" ]]; then
  echo "Rollback target image: $ROLLBACK_IMAGE"
  echo "Runtime commit represented by that image: $PREVIOUS_COMMIT"
  echo "SQLite backup retained at: ${BACKUP_DIR:-unknown}"
  read -r -p "Continue rollback? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Rollback cancelled."; exit 0; }
fi

echo "[rollback] Retagging previous production image as current..."
docker image tag "$ROLLBACK_IMAGE" bien-noi-nho-auto-media:current
APP_IMAGE_TAG=current docker compose up -d --no-build --force-recreate auto-media

healthy=false
for ((attempt=1; attempt<=HEALTH_RETRIES; attempt++)); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep "$HEALTH_SLEEP_SECONDS"
done

if [[ "$healthy" != "true" ]]; then
  echo "[rollback] ERROR: previous image did not become healthy at $HEALTH_URL" >&2
  docker compose logs --tail=120 auto-media >&2 || true
  exit 1
fi

mkdir -p "$ROOT/data/deployments"
cat > "$ROOT/data/deployments/rollback-active.env" <<EOF
ROLLBACK_AT=$(date -u +%Y%m%dT%H%M%SZ)
ACTIVE_IMAGE=bien-noi-nho-auto-media:current
ACTIVE_COMMIT=$PREVIOUS_COMMIT
ROLLBACK_SOURCE_IMAGE=$ROLLBACK_IMAGE
BACKUP_DIR=${BACKUP_DIR:-}
EOF

echo "[rollback] HEALTHY on previous image."
echo "[rollback] Production runtime is back to commit $PREVIOUS_COMMIT."
echo "[rollback] Repository working tree was NOT reset; the previous commit is recorded for controlled follow-up."
echo "[rollback] Database was NOT restored automatically; backup remains at ${BACKUP_DIR:-unknown}."
