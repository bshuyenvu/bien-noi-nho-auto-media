#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED_VERSION="${V1_EXPECTED_VERSION:-6.4.0}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:${PORT:-8787}/health}"

for cmd in git docker curl node; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "[v1-deploy] ERROR: missing command: $cmd" >&2; exit 1; }
done

[[ -f .env ]] || { echo "[v1-deploy] ERROR: .env not found. Configure server-only secrets before deployment." >&2; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[v1-deploy] ERROR: tracked working-tree changes detected; commit/stash them first." >&2
  exit 1
fi

# Pull the exact stable main before any deployment work.
git fetch --prune origin main
git switch main >/dev/null 2>&1 || git checkout main
git pull --ff-only origin main
TARGET_COMMIT="$(git rev-parse HEAD)"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
if [[ "$PACKAGE_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "[v1-deploy] ERROR: expected VietNewsFlow AI v${EXPECTED_VERSION}, found v${PACKAGE_VERSION} at ${TARGET_COMMIT}." >&2
  exit 1
fi

echo "[v1-deploy] Stable source verified: v${PACKAGE_VERSION} • ${TARGET_COMMIT}"
echo "[v1-deploy] Enforcing first-start safety: LIVE OFF • YouTube PRIVATE • strict production check."

# Shell exports override .env for this deploy without modifying server secrets.
PUBLISH_LIVE_ENABLED=false \
YOUTUBE_PRIVACY_STATUS=private \
DEPLOY_STRICT_CHECK=true \
DEPLOY_CHECK_SCOPE=runtime \
APP_REVISION="$TARGET_COMMIT" \
bash scripts/deploy-wyse.sh

# Verify the running container reports the exact release and commit.
HEALTH_JSON="$(curl -fsS --max-time 8 "$HEALTH_URL")"
HEALTH_JSON="$HEALTH_JSON" EXPECTED_VERSION="$EXPECTED_VERSION" EXPECTED_REVISION="$TARGET_COMMIT" node --input-type=module - <<'NODE'
const h=JSON.parse(process.env.HEALTH_JSON||'{}');
const expectedVersion=process.env.EXPECTED_VERSION;
const expectedRevision=process.env.EXPECTED_REVISION;
if(h.ok!==true)throw new Error('health ok=true missing');
if(String(h.version)!==expectedVersion)throw new Error(`health version mismatch: ${h.version} != ${expectedVersion}`);
if(String(h.revision)!==expectedRevision)throw new Error(`health revision mismatch: ${h.revision} != ${expectedRevision}`);
console.log(`[v1-deploy] Health verified: v${h.version} • ${String(h.revision).slice(0,12)} • ${h.releaseChannel||'stable'}`);
NODE

echo "[v1-deploy] V1 PRIVATE-FIRST deployment completed safely."
echo "[v1-deploy] LIVE remains OFF. Do not edit privacy to PUBLIC manually."
echo "[v1-deploy] Next operator flow: OAuth/Test -> Private Test -> Activation Wizard -> Unlisted Canary -> Public Canary/Ramp."
