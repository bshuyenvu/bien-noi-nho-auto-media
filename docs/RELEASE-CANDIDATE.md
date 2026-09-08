# Phase 5.0 — Release Candidate & Production Acceptance Gate

Phase 5.0 adds one explicit GO / NO-GO decision before a real production activation.

## What the gate checks

`GET /api/admin/release-readiness` verifies:

- application version and runtime Git revision;
- SQLite `PRAGMA quick_check`;
- required production tables;
- SQLite WAL mode;
- Production Monitor is not RED;
- Maintenance Mode is OFF;
- no publish job or YouTube upload session is `needs_reconcile`;
- publisher OAuth/vault configuration is complete;
- YouTube cached readiness is fresh;
- Private Live Test is present when Public/Unlisted requires it;
- durable YouTube resumable upload is enabled.

The dashboard panel **Production Release Gate** shows each check individually.

## Verdict meanings

### GO

The release candidate has no blocking check.

`candidateReady=true` means the software/runtime/data state passed the release gate.

`activationReady=true` additionally means the YouTube credential/private-test requirements are ready for activation.

`liveOperational=true` means the activation gate passed and `PUBLISH_LIVE_ENABLED=true` is already active.

### NO-GO

At least one blocking check failed. Do not enable LIVE until every blocker is resolved.

Warnings do not make the candidate NO-GO, but should be reviewed before activation.

## Run the gate from the dashboard

Admin only:

1. Open **Production Release Gate**.
2. Click **CHẠY ACCEPTANCE**.
3. Resolve every red check.
4. Re-run until the verdict is GO.

The manual acceptance run is stored in Operator Audit Trail as `release.acceptance-run`.

## Run from the Dell Wyse shell

```bash
npm run prod:check
```

For a deployment that must fail when the release is not acceptable:

```bash
PROD_CHECK_STRICT=true npm run prod:check
```

The existing deploy script already runs production checks after container replacement. Strict mode therefore provides a rollback-capable release gate.

## SQLite backup/restore release drill

CI runs `npm run smoke:release-candidate`.

The smoke test:

1. creates a clean production-like SQLite database;
2. verifies a GO candidate;
3. inserts a `needs_reconcile` publish job and verifies NO-GO;
4. snapshots SQLite using `VACUUM INTO`;
5. opens the restored database;
6. runs `PRAGMA quick_check`;
7. verifies that the blocking publish row survived the restore.

This confirms that the release decision and the backup/restore path protect the same durable data used by production queues.

## Version and revision

The release panel reads the application version from `package.json` instead of a duplicated release constant.

Docker images expose the build revision through `APP_REVISION`, derived from the existing `APP_REVISION` build argument. A production image reporting revision `unknown` is a release blocker.

## Recommended activation sequence

1. Deploy with `PUBLISH_LIVE_ENABLED=false`.
2. Run `npm run prod:check`.
3. Confirm **Production Release Gate = GO**.
4. Confirm YouTube **TEST KẾT NỐI** is fresh.
5. Run/confirm the Private Live Test if required by the configured privacy mode.
6. Resolve every `needs_reconcile` job.
7. Take a SQLite backup.
8. Enable `PUBLISH_LIVE_ENABLED=true`.
9. Recreate the container.
10. Run `PROD_CHECK_STRICT=true npm run prod:check`.
11. Start with Private/Unlisted before Public.

Never turn LIVE on merely because CI is green. The release gate intentionally combines CI-ready code with the actual server/database/credential state.
