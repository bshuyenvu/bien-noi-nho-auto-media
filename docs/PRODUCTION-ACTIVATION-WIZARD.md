# Production Activation Wizard

Phase 5.1 adds a second, persistent safety gate in front of YouTube production publishing.

`PUBLISH_LIVE_ENABLED=true` no longer means that normal YouTube LIVE jobs may publish automatically. It only enables the network publishing capability. A separate SQLite-backed Production Activation state must also be ARMED.

## Safety model

YouTube production publish requires both:

1. `PUBLISH_LIVE_ENABLED=true` in the server environment.
2. Production Activation Wizard is ARMED and the current `YOUTUBE_PRIVACY_STATUS` does not exceed the privacy level approved by the wizard.

The Production Kill Switch overrides both and blocks all YouTube live publishing immediately, including Private Test jobs.

Dry-run jobs are unaffected.

## Why two gates

Environment configuration is intentionally slow and durable: changing `.env` normally requires container recreation.

The SQLite Activation Gate is an operator control that can be changed immediately from the authenticated admin dashboard. This prevents an accidental `.env` change from automatically opening PUBLIC publishing.

## Required sequence

### 1. Backup SQLite

On the Wyse host:

```bash
bash scripts/backup-wyse.sh
```

After the backup succeeds, click **XÁC NHẬN BACKUP** in the wizard.

The confirmation expires after `ACTIVATION_BACKUP_MAX_AGE_HOURS` (default 24 hours).

### 2. Release Gate must be GO

Run **CHẠY ACCEPTANCE** in Production Release Gate or:

```bash
npm run prod:check
```

Resolve every NO-GO blocker before continuing.

### 3. Refresh YouTube OAuth readiness

In Channel Connections:

- connect/reconnect YouTube if necessary;
- run **TEST KẾT NỐI**;
- verify the expected channel title and channel ID.

### 4. Run YouTube Private Live Test

Set on the server:

```env
PUBLISH_LIVE_ENABLED=true
YOUTUBE_PRIVACY_STATUS=private
```

Recreate/deploy the container:

```bash
bash scripts/deploy-wyse.sh
```

The Activation Wizard remains DISARMED, so normal LIVE publish jobs are still blocked. Private deployment test jobs are allowed while the Kill Switch is OFF.

Run **Private Live Test** and verify the video in YouTube Studio.

### 5. ARM production at PRIVATE

The wizard requires:

- recent backup confirmation;
- Release Gate GO;
- fresh OAuth readiness;
- successful Private Live Test;
- zero `needs_reconcile` publish jobs/sessions;
- `PUBLISH_LIVE_ENABLED=true`;
- `YOUTUBE_PRIVACY_STATUS=private`;
- Kill Switch OFF.

Click **ARM LIVE** and enter exactly:

```text
ARM LIVE
```

Normal PRIVATE production publishing is now allowed.

### 6. Authorize UNLISTED test

Click **AUTHORIZE UNLISTED** and enter:

```text
AUTHORIZE UNLISTED
```

The wizard raises the privacy ceiling to UNLISTED.

Then change `.env`:

```env
YOUTUBE_PRIVACY_STATUS=unlisted
```

and recreate the container:

```bash
bash scripts/deploy-wyse.sh
```

Publish one controlled Unlisted video and verify it directly in YouTube Studio.

### 7. Verify UNLISTED

Click **VERIFY UNLISTED**.

Provide the verified YouTube video ID and enter exactly:

```text
UNLISTED VERIFIED
```

The verification timestamp and video ID are stored as non-secret operational evidence in SQLite.

### 8. Approve PUBLIC

PUBLIC cannot be approved until UNLISTED has been verified and Release Gate is still GO.

Click **APPROVE PUBLIC** and enter exactly:

```text
APPROVE PUBLIC
```

Only then does the wizard privacy ceiling become PUBLIC.

Change `.env`:

```env
YOUTUBE_PRIVACY_STATUS=public
```

and recreate the container:

```bash
bash scripts/deploy-wyse.sh
```

The Publish Worker checks the SQLite Activation Guard immediately before every YouTube production publish.

## Kill Switch

**KILL SWITCH** is independent of ARM/ABORT and takes precedence over every activation state.

Use it when:

- the wrong channel/account is suspected;
- unexpected uploads appear;
- a credential or automation problem is suspected;
- operator wants an immediate freeze without editing `.env`.

When engaged:

- normal YouTube LIVE jobs are blocked;
- Private Test jobs are also blocked;
- dry-runs remain safe;
- render and review workflows continue unless separately paused.

To clear it, Release Gate must be GO and the operator must enter:

```text
CLEAR KILL SWITCH
```

Clearing the Kill Switch does not automatically ARM a previously aborted activation.

## ABORT

**ABORT** immediately DISARMS Production Activation and resets the approved privacy ceiling to PRIVATE.

It does not modify `.env` and does not delete credentials.

After ABORT, normal YouTube production publish is blocked until the wizard is ARMED again.

## Audit Trail

The following events are recorded in Operator Audit Trail:

- backup confirmation;
- ARM;
- Unlisted authorization;
- Unlisted verification;
- Public approval;
- ABORT;
- Kill Switch engage/clear.

Secrets and OAuth tokens are not written to these events.

## Production check

`npm run prod:check` reports:

- Activation ARMED/DISARMED;
- approved maximum privacy;
- current environment privacy;
- Kill Switch state;
- final Production Publish Guard ALLOW/BLOCK reason.

In strict mode, a Kill Switch is a failure. If environment privacy is above PRIVATE, a closed Activation Guard is also a strict failure.

## CI safety contract

`smoke:activation-wizard` proves:

- normal LIVE is blocked before ARM;
- Private Test is allowed before ARM while Kill Switch is OFF;
- ARM requires all preconditions and exact confirmation;
- UNLISTED requires explicit authorization;
- PUBLIC requires verified UNLISTED evidence;
- Kill Switch blocks normal LIVE and Private Test;
- ABORT closes the guard again.
