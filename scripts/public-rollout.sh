#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)";cd "$ROOT"
ENV_FILE="${PUBLIC_ROLLOUT_ENV_FILE:-$ROOT/.env}"
HEALTH_URL="${PUBLIC_ROLLOUT_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"
POLL_SECONDS="${PUBLIC_ROLLOUT_SCRIPT_POLL_SECONDS:-5}"
TIMEOUT_SECONDS="${PUBLIC_ROLLOUT_SCRIPT_TIMEOUT_SECONDS:-3600}"
CANARY_RENDER_ID="${PUBLIC_CANARY_RENDER_JOB_ID:-}"
PUBLIC_PHASE=false
for cmd in docker awk grep curl;do command -v "$cmd" >/dev/null 2>&1||{ echo "[public-rollout] ERROR: missing command $cmd" >&2;exit 1;};done
docker compose version >/dev/null 2>&1||{ echo "[public-rollout] ERROR: Docker Compose v2 required" >&2;exit 1;};[[ -f "$ENV_FILE" ]]||{ echo "[public-rollout] ERROR: .env not found" >&2;exit 1;}
client(){ docker compose exec -T auto-media node scripts/public-rollout-client.mjs "$@"; }
set_env_key(){ local key="$1" value="$2" tmp;tmp="$(mktemp "${ENV_FILE}.XXXXXX")";awk -v k="$key" -v v="$value" 'BEGIN{f=0} index($0,k"=")==1{if(!f){print k"="v;f=1}next}{print}END{if(!f)print k"="v}' "$ENV_FILE" > "$tmp";chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null||chmod 600 "$tmp";mv "$tmp" "$ENV_FILE";}
wait_health(){ for((i=1;i<=40;i++));do curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1&&return 0;sleep 3;done;echo '[public-rollout] ERROR: service health timeout' >&2;return 1;}
kill_switch(){ local reason="${1:-Public rollout script failure}";echo "[public-rollout] SAFETY: engaging Kill Switch: $reason" >&2;client kill "$reason" >/dev/null 2>&1||echo '[public-rollout] WARNING: could not reach Kill Switch API' >&2;}
on_error(){ local code="$1" line="$2";trap - ERR;echo "[public-rollout] ERROR at line $line (exit $code)" >&2;if [[ "$PUBLIC_PHASE" == true ]];then kill_switch "Public rollout script failed at line $line";fi;exit "$code";};trap 'on_error $? $LINENO' ERR

[[ "$(client public-approved)" == true ]]||{ echo '[public-rollout] STOP: operator has not manually APPROVED PUBLIC in Activation Wizard.' >&2;exit 20;}
[[ "$(client kill-engaged)" != true ]]||{ echo '[public-rollout] STOP: Kill Switch is engaged. Investigate and clear manually first.' >&2;exit 21;}
status="$(client rollout-status)";if [[ "$status" == completed ]];then echo '[public-rollout] Already COMPLETED. Normal PUBLIC publishing is open.';exit 0;fi

echo '[public-rollout] Creating SQLite backup before PUBLIC runtime switch...'
bash scripts/backup-wyse.sh
set_env_key YOUTUBE_PRIVACY_STATUS public
PUBLIC_PHASE=true
echo '[public-rollout] Recreating app with YOUTUBE_PRIVACY_STATUS=public; normal PUBLIC remains backend-locked.'
APP_IMAGE_TAG=current docker compose up -d --no-build --force-recreate auto-media
wait_health
docker compose exec -T -e PROD_CHECK_STRICT=true auto-media npm run prod:check

status="$(client rollout-status)";if [[ "$status" == failed ]];then kill_switch 'Public rollout state is FAILED after PUBLIC runtime switch';exit 22;fi
if [[ "$status" == idle ]];then
  CANARY_RENDER_ID="${CANARY_RENDER_ID:-$(client candidate)}";[[ -n "$CANARY_RENDER_ID" ]]||{ echo '[public-rollout] ERROR: no READY render available for Public Canary.' >&2;false;}
  echo "[public-rollout] Creating the single Public Canary from render $CANARY_RENDER_ID..."
  CANARY_JOB_ID="$(client create-canary "$CANARY_RENDER_ID")"
else CANARY_JOB_ID="$(client canary-job-id)";fi
[[ -n "${CANARY_JOB_ID:-}" ]]||{ echo '[public-rollout] ERROR: missing Public Canary job ID' >&2;false;}

start="$(date +%s)"
while true;do
  client worker-run >/dev/null 2>&1||true
  job_status="$(client job-status "$CANARY_JOB_ID")"
  case "$job_status" in published) break;;needs_reconcile|failed|cancelled) err="$(client job-error "$CANARY_JOB_ID" 2>/dev/null||true)";kill_switch "Public Canary $job_status: $err";echo "[public-rollout] STOP: Canary $job_status" >&2;exit 23;;pending|scheduled|publishing) ;;*) echo "[public-rollout] ERROR: unexpected Canary status $job_status" >&2;false;;esac
  (( $(date +%s)-start < TIMEOUT_SECONDS ))||{ echo '[public-rollout] ERROR: Canary publish timeout' >&2;false;};sleep "$POLL_SECONDS"
done

status="$(client rollout-status)";if [[ "$status" == canary_queued ]];then echo '[public-rollout] Verifying Public Canary remotely and starting watch window...';client verify >/dev/null;fi
start="$(date +%s)"
while true;do
  status="$(client check)"
  case "$status" in completed) break;;failed) echo '[public-rollout] STOP: post-publish watch FAILED; Kill Switch remains engaged.' >&2;exit 24;;watching) ;;*) echo "[public-rollout] ERROR: unexpected rollout status $status" >&2;false;;esac
  (( $(date +%s)-start < TIMEOUT_SECONDS ))||{ echo '[public-rollout] ERROR: post-publish watch timeout' >&2;false;};sleep "$POLL_SECONDS"
done
[[ "$(client normal-open)" == true ]]||{ echo '[public-rollout] ERROR: rollout completed but normal PUBLIC guard is not open' >&2;false;}
trap - ERR
remote_id="$(client job-remote-id "$CANARY_JOB_ID")"
echo "[public-rollout] SUCCESS: PUBLIC CANARY VERIFIED + WATCH COMPLETED • video=$remote_id"
echo '[public-rollout] Normal PUBLIC publishing is now open. Kill Switch remains operator-controlled and is never auto-cleared.'
