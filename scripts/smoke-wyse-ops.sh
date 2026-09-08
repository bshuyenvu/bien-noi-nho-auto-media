#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash -n scripts/backup-wyse.sh
bash -n scripts/deploy-wyse.sh
bash -n scripts/rollback-wyse.sh
node --check scripts/sqlite-backup.mjs

grep -q 'bash scripts/backup-wyse.sh' scripts/deploy-wyse.sh
grep -q 'bash scripts/rollback-wyse.sh --auto' scripts/deploy-wyse.sh
grep -q 'image: bien-noi-nho-auto-media:${APP_IMAGE_TAG:-current}' docker-compose.yml
grep -q 'Database was NOT restored automatically' scripts/rollback-wyse.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

source_db="$tmp/source.sqlite"
snapshot_db="$tmp/snapshot.sqlite"
DB_PATH="$source_db" node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db=new DatabaseSync(process.env.DB_PATH);
  db.exec("CREATE TABLE smoke(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO smoke(value) VALUES (\"ok\")");
  db.close();
'
DB_PATH="$source_db" node scripts/sqlite-backup.mjs "$snapshot_db" >/dev/null
DB_PATH="$snapshot_db" node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db=new DatabaseSync(process.env.DB_PATH,{readOnly:true});
  const row=db.prepare("SELECT value FROM smoke WHERE id=1").get();
  db.close();
  if(row?.value!=="ok")throw new Error("SQLite snapshot content mismatch");
'

result="$(BACKUP_ROOT="$tmp/backups" DB_HOST_PATH="$source_db" BACKUP_RETENTION_COUNT=2 bash scripts/backup-wyse.sh | tail -n 1)"
[[ -f "$result/auto-media.sqlite" ]]
[[ -f "$result/SHA256SUMS" ]]
(
  cd "$result"
  sha256sum -c SHA256SUMS >/dev/null
)

echo "Wyse deploy/backup/rollback smoke OK"
