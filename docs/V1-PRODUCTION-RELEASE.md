# VietNewsFlow AI — V1 Production Release

Release generation: **V1 Production**  
Package version: **6.4.0**  
Release channel: **stable**

## Release status

V1 Production closes the platform hardening track through Phase 6.0. The repository is production-capable for the supported YouTube workflow, but remains safe-by-default: LIVE publishing is disabled in the example/runtime defaults and YouTube privacy defaults to `private`.

## Frozen V1 production chain

Draft → Durable Review Gate → Render/Profile binding → Immutable Render Manifest → Content Safety → Activation Gate → Gradual Public Ramp → Publish Queue → Resumable YouTube Upload → Remote Canary/Provenance → Monitoring/Consistency Audit.

## Mandatory safety invariants

- `PUBLISH_LIVE_ENABLED=false` by default.
- `YOUTUBE_PRIVACY_STATUS=private` by default.
- Facebook and TikTok LIVE remain locked until their provider implementations are separately production-verified.
- Review approval is versioned and becomes stale when content or bound render profile changes.
- A non-dry-run YouTube upload cannot cross the provider boundary unless the current MP4 bytes match the stored SHA-256 render manifest.
- Ambiguous remote state is moved to `needs_reconcile`; it is never blindly retried.
- Public publishing requires explicit activation, verified Unlisted/Public Canary evidence and the Public Ramp guard.
- Public Ramp circuit and Production Kill Switch never auto-clear.
- Consistency repair is limited to deterministic local state. Remote-dependent inconsistencies keep Release Gate at NO-GO.

## Final acceptance

Run before every V1 deployment:

```bash
npm install --no-audit --no-fund
npm run typecheck
npm run build
npm run smoke:v1-acceptance
```

The GitHub Actions workflow also runs the complete smoke suite: production startup, Docker/Wyse operations, monitoring, self-heal, maintenance, audit, analytics, durable queue, durable Review, artifact integrity, end-to-end consistency, resumable upload, release gate, activation, remote Canary, controlled Public rollout, Public Ramp, duplicate guard, recovery, OAuth and frontend syntax.

## Dell Wyse production cutover

1. Pull the exact merged `main` revision.
2. Back up SQLite and output state using the existing deployment/cutover scripts.
3. Keep `PUBLISH_LIVE_ENABLED=false` for the first startup.
4. Build/recreate the container and run `npm run prod:check` (or the container-equivalent operator check).
5. Resolve every Release Gate blocker before activation.
6. Connect/test YouTube OAuth with the intended channel.
7. Use the Production Activation Wizard and Private/Unlisted Canary flow.
8. Public approval remains an explicit operator action. Start at Public Ramp Stage 1.

## Rollback rule

If deployment health, Release Gate, consistency audit, artifact integrity, Canary verification or Public Rollout becomes unsafe, engage Kill Switch, stop further LIVE publishing and use the existing Wyse rollback/backup procedure. Do not clear Kill Switch until the underlying condition has been reviewed.

## Known V1 boundaries

- YouTube is the only LIVE provider in the production-approved path.
- Facebook LIVE remains locked.
- TikTok provider remains locked/placeholder.
- Real production activation requires the operator's actual server, OAuth credentials and channel access; repository CI cannot prove a real-world YouTube post occurred.

## Definition of done

The codebase is considered **V1 Production complete** when the Phase 6.0 PR is merged to `main` after the latest head passes the entire CI workflow, including `V1 Production final acceptance contract`. Real LIVE activation is a separate operator deployment action and is not performed automatically by the release process.
