#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT="scripts/deploy-v1-private.sh"
[[ -f "$SCRIPT" ]] || { echo "missing $SCRIPT" >&2; exit 1; }
bash -n "$SCRIPT"

grep -Fq 'PUBLISH_LIVE_ENABLED=false' "$SCRIPT" || { echo 'LIVE safe override missing' >&2; exit 1; }
grep -Fq 'YOUTUBE_PRIVACY_STATUS=private' "$SCRIPT" || { echo 'PRIVATE safe override missing' >&2; exit 1; }
grep -Fq 'DEPLOY_STRICT_CHECK=true' "$SCRIPT" || { echo 'strict deploy check missing' >&2; exit 1; }
grep -Fq 'DEPLOY_CHECK_SCOPE=runtime' "$SCRIPT" || { echo 'runtime-only private deploy scope missing' >&2; exit 1; }
grep -Fq 'EXPECTED_VERSION="${V1_EXPECTED_VERSION:-6.4.0}"' "$SCRIPT" || { echo 'stable version guard missing' >&2; exit 1; }

for forbidden in 'approve-public' 'APPROVE PUBLIC' 'public-rollout.sh' 'production-cutover.sh'; do
  if grep -Fq "$forbidden" "$SCRIPT"; then
    echo "unsafe activation reference found: $forbidden" >&2
    exit 1
  fi
done

echo 'V1 private-first deployment wrapper safety smoke OK'
