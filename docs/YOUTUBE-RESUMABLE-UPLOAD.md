# YouTube Durable Resumable Upload

Phase 4.9 hardens YouTube publishing against network loss, API throttling, container restart, and uncertain remote state.

## Safety invariant

Never create a new YouTube upload when the previous remote state is uncertain.

A retry is safe only when one of these is true:

1. YouTube status query confirms the last committed byte and the existing resumable session can continue.
2. The operator has reconciled the interrupted job and explicitly approved a new retry.

If the system cannot prove the remote state, the publish job becomes `needs_reconcile`.

## Durable session lifecycle

A resumable session is persisted in SQLite before the first video chunk is sent.

`youtube_upload_sessions` stores:

- publish job ID and owner ID;
- resumable session URI;
- local file path and file size;
- effective chunk size;
- next confirmed byte offset;
- retry counter and last HTTP status;
- state: `active`, `completed`, `failed`, or `needs_reconcile`;
- remote video ID/URL after completion.

The session URI is not returned by API responses, dashboard UI, or normal logs. Treat the SQLite database and its backups as production-sensitive data.

## Chunk rules

`YOUTUBE_UPLOAD_CHUNK_BYTES` is normalized down to a multiple of 256 KiB.

Default for the Dell Wyse 5060:

```env
YOUTUBE_UPLOAD_CHUNK_BYTES=8388608
```

That is 8 MiB. The final chunk may be smaller.

If an operator enters a non-multiple value, startup diagnostics report both the requested and effective values. The uploader uses the effective safe value rather than failing production startup.

## Retry policy

Transient conditions:

- network/timeout errors;
- HTTP 429;
- HTTP 500;
- HTTP 502;
- HTTP 503;
- HTTP 504.

After a transient failure, the uploader does not assume that the failed chunk was rejected. It waits using exponential backoff with optional jitter, then queries the resumable session status using an empty `PUT` and `Content-Range: bytes */TOTAL`.

If YouTube returns `308 Resume Incomplete`, the uploader reads the `Range` response header and resumes from the next server-confirmed byte.

Other non-success 4xx responses are treated as permanent failures unless the response specifically represents an uncertain resumable state.

## Retry configuration

```env
YOUTUBE_UPLOAD_MAX_RETRIES=6
YOUTUBE_UPLOAD_RETRY_BASE_MS=1000
YOUTUBE_UPLOAD_RETRY_MAX_MS=60000
YOUTUBE_UPLOAD_RETRY_JITTER=true
YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS=120000
```

`Retry-After`, when present, takes priority within the configured maximum delay.

## Restart recovery

When the Publish Worker starts:

### YouTube job has an active/completed durable session

The interrupted `publishing` job is moved to `pending` for recovery. The uploader queries the existing session before sending any video bytes.

- If YouTube reports completion, the existing video ID is saved and no new upload is created.
- If YouTube reports an offset, upload resumes from that offset.
- If the session is expired or remote state cannot be proven, the job moves to `needs_reconcile`.

### Publish job has no safe durable session

The job moves directly to `needs_reconcile`. Automatic retry is blocked.

### Dry-run

Dry-run publishing can safely return to `pending` because it has no remote side effect.

## Session expiration

A `404` from an existing resumable session means the session can no longer be used.

If the session had never sent any chunk, it may be replaced safely.

If any upload attempt had already started, the system does not create a fresh upload automatically. It marks the session/job `needs_reconcile` so the operator can verify YouTube first.

## File integrity guard

A persisted session is bound to the local video path and file size used when the session was created.

If the rendered file changes after upload has started, the uploader refuses to continue and moves the upload to `needs_reconcile`.

## Reconcile flow

For `needs_reconcile`:

1. Open YouTube Studio and verify whether the video exists.
2. If the video exists, use **MARK PUBLISHED** and provide the verified video ID.
3. If it does not exist, use **ĐÃ KIỂM TRA • RETRY**. This clears the uncertain old session before a new upload can be created.
4. Use **MARK FAILED** or **CANCEL** only after remote verification.

Never use Retry merely because the local request returned an error; the remote service may have accepted bytes or completed the upload before the local connection failed.

## Monitoring

Production Monitor becomes YELLOW whenever at least one publish job is `needs_reconcile`.

`npm run prod:check` reports:

- durable resumable upload enabled;
- effective chunk size;
- retry budget;
- per-request timeout;
- jitter state;
- any chunk normalization warning.

## Recommended production defaults

For Dell Wyse 5060 / 4 GB RAM:

```env
YOUTUBE_UPLOAD_CHUNK_BYTES=8388608
YOUTUBE_UPLOAD_MAX_RETRIES=6
YOUTUBE_UPLOAD_RETRY_BASE_MS=1000
YOUTUBE_UPLOAD_RETRY_MAX_MS=60000
YOUTUBE_UPLOAD_RETRY_JITTER=true
YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS=120000
```

Keep `PUBLISH_LIVE_ENABLED=false` until OAuth readiness and YouTube Private Live Test have passed on the real server.

## Reference

YouTube Data API resumable upload protocol:

https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol

YouTube upload guide:

https://developers.google.com/youtube/v3/guides/uploading_a_video
