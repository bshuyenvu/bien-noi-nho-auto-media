#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash -n scripts/backup-wyse.sh
bash -n scripts/deploy-wyse.sh
bash -n scripts/rollback-wyse.sh

grep -q 'bash scripts/backup-wyse.sh' scripts/deploy-wyse.sh
grep -q 'bash scripts/rollback-wyse.sh --auto' scripts/deploy-wyse.sh
grep -q 'image: bien-noi-nho-auto-media:${APP_IMAGE_TAG:-current}' docker-compose.yml
grep -q 'Database was NOT restored automatically' scripts/rollback-wyse.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'offline-snapshot-smoke\n' > "$tmp/test.sqlite"
result="$(BACKUP_ROOT="$tmp/backups" DB_HOST_PATH="$tmp/test.sqlite" BACKUP_RETENTION_COUNT=2 bash scripts/backup-wyse.sh | tail -n 1)"
[[ -f "$result/auto-media.sqlite" ]]
[[ -f "$result/SHA256SUMS" ]]
(
  cd "$result"
  sha256sum -c SHA256SUMS >/dev/null
)

echo "Wyse deploy/backup/rollback smoke OK"
