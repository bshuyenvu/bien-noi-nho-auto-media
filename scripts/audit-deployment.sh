#!/usr/bin/env bash
set -Eeuo pipefail

STATUS="${1:-success}"
REVISION="${2:-}"
PREVIOUS_REVISION="${3:-}"
[[ -n "$REVISION" ]] || { echo "[audit-deploy] revision required" >&2; exit 2; }

docker compose ps --status running --services 2>/dev/null | grep -qx 'auto-media' || exit 5

docker compose exec -T \
  -e AUDIT_DEPLOY_STATUS="$STATUS" \
  -e AUDIT_DEPLOY_REVISION="$REVISION" \
  -e AUDIT_DEPLOY_PREVIOUS_REVISION="$PREVIOUS_REVISION" \
  auto-media node --input-type=module -e '
    const key=String(process.env.RENDER_API_KEY||"");
    if(!key)process.exit(4);
    const r=await fetch("http://127.0.0.1:8787/api/admin/audit/deploy",{
      method:"POST",
      headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},
      body:JSON.stringify({status:process.env.AUDIT_DEPLOY_STATUS||"success",revision:process.env.AUDIT_DEPLOY_REVISION,previousRevision:process.env.AUDIT_DEPLOY_PREVIOUS_REVISION||undefined})
    });
    if(r.status===404)process.exit(3);
    if(!r.ok){console.error(await r.text());process.exit(1)}
  '
