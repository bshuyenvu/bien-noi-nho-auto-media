#!/usr/bin/env bash
set -Eeuo pipefail

bash -n scripts/production-cutover.sh
node --check scripts/cutover-client.mjs
node scripts/smoke-cutover-client.mjs

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/.env" <<'EOF'
PUBLISH_LIVE_ENABLED=false
YOUTUBE_PRIVACY_STATUS=private
YOUTUBE_PRIVACY_STATUS=public
KEEP_ME=yes
EOF
CUTOVER_ENV_FILE="$tmp/.env" CUTOVER_REPORT_DIR="$tmp/reports" bash scripts/production-cutover.sh --test-env-update >/dev/null
grep -qx 'PUBLISH_LIVE_ENABLED=true' "$tmp/.env"
grep -qx 'YOUTUBE_PRIVACY_STATUS=unlisted' "$tmp/.env"
[[ "$(grep -c '^YOUTUBE_PRIVACY_STATUS=' "$tmp/.env")" == "1" ]]
grep -qx 'KEEP_ME=yes' "$tmp/.env"

grep -q 'bash scripts/deploy-wyse.sh' scripts/production-cutover.sh
grep -q 'client oauth-test' scripts/production-cutover.sh
grep -q 'client private-test' scripts/production-cutover.sh
grep -q 'client arm' scripts/production-cutover.sh
grep -q 'client authorize-unlisted' scripts/production-cutover.sh
grep -q 'client create-canary' scripts/production-cutover.sh
grep -q 'client verify-unlisted' scripts/production-cutover.sh
grep -q 'engage_kill_switch' scripts/production-cutover.sh
grep -q 'PROD_CHECK_STRICT=true' scripts/production-cutover.sh
grep -q 'report-json' scripts/production-cutover.sh
grep -q 'report-md' scripts/production-cutover.sh
if grep -q '/approve-public' scripts/production-cutover.sh scripts/cutover-client.mjs; then
  echo 'cutover must never call approve-public' >&2
  exit 1
fi

echo 'production cutover/canary shell smoke OK'
