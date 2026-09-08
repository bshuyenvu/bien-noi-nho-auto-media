#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${CUTOVER_ENV_FILE:-$ROOT/.env}"
REPORT_DIR="${CUTOVER_REPORT_DIR:-$ROOT/data/cutovers}"
STATE_FILE="${CUTOVER_STATE_FILE:-$REPORT_DIR/current.env}"
POLL_SECONDS="${CUTOVER_POLL_SECONDS:-5}"
JOB_TIMEOUT_SECONDS="${CUTOVER_JOB_TIMEOUT_SECONDS:-1800}"
HEALTH_RETRIES="${CUTOVER_HEALTH_RETRIES:-40}"
HEALTH_SLEEP_SECONDS="${CUTOVER_HEALTH_SLEEP_SECONDS:-3}"
HEALTH_URL="${CUTOVER_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"
CUTOVER_ID="${CUTOVER_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_REF="${BACKUP_REF:-}"
PRIVATE_RENDER_ID="${CUTOVER_PRIVATE_RENDER_JOB_ID:-}"
CANARY_RENDER_ID="${CUTOVER_CANARY_RENDER_JOB_ID:-}"
PRIVATE_JOB_ID="${PRIVATE_JOB_ID:-}"
CANARY_JOB_ID="${CANARY_JOB_ID:-}"
STAGE="${STAGE:-init}"
ARMED=false

mkdir -p "$REPORT_DIR"

set_env_key(){
  local key="$1" value="$2" file="${3:-$ENV_FILE}" tmp
  [[ -f "$file" ]] || : > "$file"
  tmp="$(mktemp "${file}.XXXXXX")"
  awk -v k="$key" -v v="$value" 'BEGIN{found=0} index($0,k"=")==1{if(!found){print k"="v;found=1}next}{print}END{if(!found)print k"="v}' "$file" > "$tmp"
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$file"
}

if [[ "${1:-}" == "--test-env-update" ]]; then
  set_env_key PUBLISH_LIVE_ENABLED true
  set_env_key YOUTUBE_PRIVACY_STATUS private
  set_env_key YOUTUBE_PRIVACY_STATUS unlisted
  grep -qx 'PUBLISH_LIVE_ENABLED=true' "$ENV_FILE"
  [[ "$(grep -c '^YOUTUBE_PRIVACY_STATUS=' "$ENV_FILE")" == "1" ]]
  grep -qx 'YOUTUBE_PRIVACY_STATUS=unlisted' "$ENV_FILE"
  echo "cutover env update test OK"
  exit 0
fi

write_state(){
  {
    printf 'CUTOVER_ID=%q\n' "$CUTOVER_ID"
    printf 'STAGE=%q\n' "$STAGE"
    printf 'BACKUP_REF=%q\n' "$BACKUP_REF"
    printf 'PRIVATE_RENDER_ID=%q\n' "$PRIVATE_RENDER_ID"
    printf 'CANARY_RENDER_ID=%q\n' "$CANARY_RENDER_ID"
    printf 'PRIVATE_JOB_ID=%q\n' "$PRIVATE_JOB_ID"
    printf 'CANARY_JOB_ID=%q\n' "$CANARY_JOB_ID"
  } > "$STATE_FILE"
}

if [[ -f "$STATE_FILE" ]]; then
  # This file is generated only by this script and contains no secrets.
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

for cmd in git docker awk grep curl; do command -v "$cmd" >/dev/null 2>&1 || { echo "[cutover] ERROR: missing command: $cmd" >&2; exit 1; }; done
docker compose version >/dev/null 2>&1 || { echo "[cutover] ERROR: Docker Compose v2 is required" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "[cutover] ERROR: .env not found" >&2; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then echo "[cutover] ERROR: tracked working-tree changes detected" >&2; exit 1; fi

client(){ docker compose exec -T auto-media node scripts/cutover-client.mjs "$@"; }
container_has_client(){ docker compose ps --status running --services 2>/dev/null | grep -qx auto-media && docker compose exec -T auto-media test -f /app/scripts/cutover-client.mjs >/dev/null 2>&1; }
wait_health(){
  local ok=false
  for ((i=1;i<=HEALTH_RETRIES;i++)); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then ok=true;break;fi
    echo "[cutover] Waiting for health ($i/$HEALTH_RETRIES)...";sleep "$HEALTH_SLEEP_SECONDS"
  done
  [[ "$ok" == true ]] || { echo "[cutover] ERROR: service did not become healthy" >&2; return 1; }
}
engage_kill_switch(){
  local reason="${1:-Production cutover safety stop}"
  echo "[cutover] SAFETY: engaging Production Kill Switch: $reason" >&2
  client kill-switch "$reason" >/dev/null 2>&1 || echo "[cutover] WARNING: Kill Switch API could not be reached; inspect service immediately." >&2
}
write_reports(){
  local json="$REPORT_DIR/cutover-${CUTOVER_ID}.json" md="$REPORT_DIR/cutover-${CUTOVER_ID}.md"
  client report-json "$PRIVATE_JOB_ID" "$CANARY_JOB_ID" "$BACKUP_REF" > "$json"
  client report-md "$PRIVATE_JOB_ID" "$CANARY_JOB_ID" "$BACKUP_REF" > "$md"
  echo "$json";echo "$md"
}
wait_publish(){
  local id="$1" label="$2" start now status err
  start="$(date +%s)"
  while true; do
    client worker-run >/dev/null 2>&1 || true
    status="$(client job-status "$id")"
    case "$status" in
      published) echo "[cutover] $label published.";return 0 ;;
      needs_reconcile) err="$(client job-error "$id" 2>/dev/null || true)";echo "[cutover] ERROR: $label needs_reconcile: $err" >&2;return 12 ;;
      failed|cancelled) err="$(client job-error "$id" 2>/dev/null || true)";echo "[cutover] ERROR: $label status=$status: $err" >&2;return 13 ;;
      pending|scheduled|publishing) ;;
      *) echo "[cutover] ERROR: unexpected $label status: $status" >&2;return 14 ;;
    esac
    now="$(date +%s)";if (( now-start >= JOB_TIMEOUT_SECONDS ));then echo "[cutover] ERROR: timeout waiting for $label" >&2;return 15;fi
    sleep "$POLL_SECONDS"
  done
}

on_error(){
  local code="$1" line="$2"
  trap - ERR
  echo "[cutover] ERROR at line $line (exit $code), stage=$STAGE" >&2
  if [[ "$ARMED" == true ]]; then engage_kill_switch "Cutover failed at stage $STAGE";fi
  if container_has_client; then write_reports >/dev/null 2>&1 || true;fi
  write_state
  exit "$code"
}
trap 'on_error $? $LINENO' ERR

# Resume an already armed Phase 5.2 cutover without resetting privacy/session state.
if container_has_client; then
  if [[ "$(client kill-switch-engaged)" == true ]]; then
    echo "[cutover] STOP: Production Kill Switch is engaged. Clear it manually in the Activation Wizard after investigation." >&2
    exit 30
  fi
  if [[ "$(client wizard-public-approved)" == true ]]; then
    echo "[cutover] STOP: PUBLIC was already approved. This canary cutover script never manages an already-public activation." >&2
    exit 31
  fi
  if [[ "$(client wizard-unlisted-verified)" == true ]]; then
    CANARY_JOB_ID="${CANARY_JOB_ID:-$(client latest-canary-job-id)}";STAGE=complete;write_state
    mapfile -t reports < <(write_reports);cp "$STATE_FILE" "$REPORT_DIR/last-success.env";rm -f "$STATE_FILE"
    echo "[cutover] CANARY ALREADY VERIFIED. PUBLIC remains manual."
    printf '[cutover] Report: %s\n' "${reports[@]}"
    exit 0
  fi
  if [[ "$(client wizard-armed)" == true ]]; then ARMED=true;fi
fi

if [[ "$ARMED" != true ]]; then
  echo "[cutover] Preparing safe PRIVATE activation environment..."
  set_env_key PUBLISH_LIVE_ENABLED true
  set_env_key YOUTUBE_PRIVACY_STATUS private
  STAGE=deploy;write_state
  DEPLOY_STRICT_CHECK=false bash scripts/deploy-wyse.sh
  wait_health
  [[ -f "$ROOT/data/deployments/latest.env" ]] && source "$ROOT/data/deployments/latest.env"
  BACKUP_REF="${BACKUP_DIR:-$BACKUP_REF}"
  STAGE=post-deploy;write_state

  if [[ "$(client kill-switch-engaged)" == true ]]; then echo "[cutover] STOP: Kill Switch is engaged after deploy." >&2;exit 30;fi
  echo "[cutover] Verifying YouTube OAuth/channel..."
  if ! channel="$(client oauth-test)"; then
    STAGE=oauth-required;write_state
    echo "[cutover] PAUSED: OAuth TEST failed. Use Channel Connections → KẾT NỐI/TEST KẾT NỐI, then run this same command again." >&2
    exit 20
  fi
  echo "[cutover] YouTube verified: $channel"
  client backup-confirm "Cutover ${CUTOVER_ID} backup: ${BACKUP_REF:-deploy backup}" >/dev/null

  PRIVATE_PASSED="$(client private-test-passed)"
  if [[ "$PRIVATE_PASSED" != true ]]; then
    PRIVATE_RENDER_ID="${PRIVATE_RENDER_ID:-$(client candidate)}"
    CANARY_RENDER_ID="${CANARY_RENDER_ID:-$(client candidate "$PRIVATE_RENDER_ID")}"
    if [[ -z "$PRIVATE_RENDER_ID" || -z "$CANARY_RENDER_ID" ]]; then
      STAGE=need-two-ready-renders;write_state
      echo "[cutover] PAUSED: cần 2 video render READY riêng biệt: một cho Private Test, một cho Unlisted Canary." >&2
      echo "[cutover] Có thể đặt CUTOVER_PRIVATE_RENDER_JOB_ID và CUTOVER_CANARY_RENDER_JOB_ID rồi chạy lại." >&2
      exit 21
    fi
    STAGE=private-test;write_state
    echo "[cutover] Creating forced-PRIVATE deployment test from render $PRIVATE_RENDER_ID..."
    PRIVATE_JOB_ID="$(client private-test "$PRIVATE_RENDER_ID")";write_state
    wait_publish "$PRIVATE_JOB_ID" "Private Test"
    [[ "$(client private-test-passed)" == true ]] || { echo "[cutover] ERROR: Private Test job published but readiness evidence was not persisted" >&2;false; }
  else
    echo "[cutover] Existing Private Test evidence is valid; skipping duplicate test."
    CANARY_RENDER_ID="${CANARY_RENDER_ID:-$(client candidate "$PRIVATE_RENDER_ID")}"
    [[ -n "$CANARY_RENDER_ID" ]] || { STAGE=need-canary-render;write_state;echo "[cutover] PAUSED: cần ít nhất 1 video render READY riêng cho Unlisted Canary." >&2;exit 22; }
  fi

  [[ "$(client release-verdict)" == GO ]] || { echo "[cutover] ERROR: Release Gate is not GO after Private Test" >&2;false; }
  STAGE=arm-private;write_state
  client arm >/dev/null
  ARMED=true
  echo "[cutover] Activation ARMED at PRIVATE."
fi

# From here any unexpected failure invokes the Kill Switch.
MAX_PRIVACY="$(client wizard-max-privacy)"
ENV_PRIVACY="$(client wizard-privacy)"
if [[ "$MAX_PRIVACY" == private ]]; then
  STAGE=authorize-unlisted;write_state
  client authorize-unlisted >/dev/null
  MAX_PRIVACY=unlisted
fi
if [[ "$MAX_PRIVACY" != unlisted ]]; then echo "[cutover] ERROR: unexpected activation ceiling: $MAX_PRIVACY" >&2;false;fi

if [[ "$ENV_PRIVACY" != unlisted ]]; then
  STAGE=switch-unlisted;write_state
  echo "[cutover] Switching container privacy to UNLISTED; PUBLIC is still not approved."
  set_env_key YOUTUBE_PRIVACY_STATUS unlisted
  APP_IMAGE_TAG=current docker compose up -d --no-build --force-recreate auto-media
  wait_health
fi

STAGE=strict-unlisted-check;write_state
docker compose exec -T -e PROD_CHECK_STRICT=true auto-media npm run prod:check
[[ "$(client wizard-privacy)" == unlisted ]] || { echo "[cutover] ERROR: runtime privacy is not UNLISTED" >&2;false; }
[[ "$(client release-verdict)" == GO ]] || { echo "[cutover] ERROR: Release Gate lost GO before canary" >&2;false; }

if [[ -z "$CANARY_JOB_ID" ]]; then
  CANARY_RENDER_ID="${CANARY_RENDER_ID:-$(client candidate "$PRIVATE_RENDER_ID")}"
  if [[ -z "$CANARY_RENDER_ID" ]]; then STAGE=need-canary-render-after-arm;write_state;engage_kill_switch 'Cutover paused: no READY render available for Unlisted canary';echo "[cutover] PAUSED with Kill Switch: create a READY render, inspect state, then clear Kill Switch manually before resuming." >&2;exit 23;fi
  STAGE=unlisted-canary;write_state
  echo "[cutover] Creating UNLISTED canary from render $CANARY_RENDER_ID..."
  CANARY_JOB_ID="$(client create-canary "$CANARY_RENDER_ID")";write_state
fi

STAGE=wait-canary;write_state
wait_publish "$CANARY_JOB_ID" "Unlisted Canary"
CANARY_REMOTE_ID="$(client job-remote-id "$CANARY_JOB_ID")"
[[ -n "$CANARY_REMOTE_ID" ]] || { echo "[cutover] ERROR: published canary has no remote ID" >&2;false; }

STAGE=verify-canary;write_state
client verify-unlisted "$CANARY_REMOTE_ID" >/dev/null
[[ "$(client wizard-unlisted-verified)" == true ]] || { echo "[cutover] ERROR: Unlisted verification evidence did not persist" >&2;false; }
[[ "$(client wizard-public-approved)" != true ]] || { echo "[cutover] ERROR: PUBLIC must not be auto-approved by cutover" >&2;false; }

STAGE=final-check;write_state
docker compose exec -T -e PROD_CHECK_STRICT=true auto-media npm run prod:check
STAGE=complete;write_state
mapfile -t reports < <(write_reports)
cp "$STATE_FILE" "$REPORT_DIR/last-success.env"
rm -f "$STATE_FILE"
trap - ERR

echo "[cutover] SUCCESS: UNLISTED CANARY VERIFIED."
echo "[cutover] PUBLIC WAS NOT ENABLED. Review the canary, then approve PUBLIC manually in Production Activation Wizard only if acceptable."
printf '[cutover] Report: %s\n' "${reports[@]}"
