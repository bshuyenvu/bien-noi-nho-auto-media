# Phase 5.4 — Controlled Public Rollout & Post-Publish Watch

## Safety invariant

`APPROVE PUBLIC` does **not** immediately open normal PUBLIC publishing.

After manual approval, the backend allows exactly one `publicCanary` while normal PUBLIC jobs remain blocked. Normal PUBLIC opens only after:

1. runtime is `YOUTUBE_PRIVACY_STATUS=public`;
2. Release Gate is GO;
3. Monitor is not RED;
4. there is no `needs_reconcile` / uncertain upload session;
5. Kill Switch is OFF;
6. one Public Canary is published;
7. YouTube `videos.list` confirms the same video is on the expected channel with `privacyStatus=public`, `uploadStatus=processed`, and `processingDetails.processingStatus=succeeded`;
8. the post-publish watch window finishes healthy; and
9. the same Public Canary passes a final remote verification.

Any watch failure moves rollout to `FAILED` and engages the Production Kill Switch. The application never auto-clears the Kill Switch.

## Recommended Wyse workflow

Complete Phase 5.3 first: Unlisted Canary verified remotely and `APPROVE PUBLIC` performed manually in Production Activation Wizard.

Then run:

```bash
bash scripts/public-rollout.sh
```

The script:

- refuses to run before manual Public approval;
- refuses to continue if Kill Switch is engaged;
- creates a SQLite backup;
- changes only `YOUTUBE_PRIVACY_STATUS=public` in `.env`;
- recreates the existing production image;
- runs strict `prod:check` while normal PUBLIC remains intentionally locked;
- selects one READY render, or uses `PUBLIC_CANARY_RENDER_JOB_ID` when supplied;
- creates exactly one Public Canary;
- waits for the Publish Worker;
- verifies the Canary remotely;
- waits through the post-publish watch window; and
- exits successfully only when normal PUBLIC is open.

The script is resume-safe: an existing `publicCanaryJobId` is reused rather than creating a second canary.

## Dashboard

The **Controlled Public Rollout** panel shows:

- manual Public approval;
- Public Canary job and remote ID;
- remote verification time;
- watch start/end;
- `IDLE / CANARY_QUEUED / WATCHING / COMPLETED / FAILED`; and
- whether normal PUBLIC is `OPEN` or `LOCKED`.

Admin actions:

- `START PUBLIC CANARY`
- `VERIFY PUBLIC CANARY`
- `CHECK WATCH NOW`
- `RESET FAILED` — available only after the operator has investigated and manually cleared Kill Switch.

## Configuration

```env
PUBLIC_ROLLOUT_WATCH_MINUTES=15
PUBLIC_ROLLOUT_WATCH_POLL_MS=30000
```

The watcher does not poll YouTube every 30 seconds. Local health/release state is checked each cycle. YouTube is queried when the Public Canary is initially verified and again when the watch window completes.

## Failure handling

If the Canary becomes `failed`, `cancelled`, or `needs_reconcile`, or if the watch detects Release NO-GO, Monitor RED, ambiguous publish state, or a remote Canary that is no longer valid, stop publishing and investigate with the Kill Switch left engaged.

Do not use `RESET FAILED` as a way to bypass an unresolved incident. Clear Kill Switch only after Release Gate is GO and the incident has been understood.

## YouTube API basis

The remote checks use `videos.list` with `part=snippet,status,processingDetails`. The authenticated owner can read `processingDetails`; the rollout requires processed/succeeded state and the expected privacy/channel before opening normal PUBLIC publishing.
