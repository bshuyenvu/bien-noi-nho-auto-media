# Phase 4.8 — Durable Production Queue + Stuck Publish Recovery

## Mục tiêu

Phase này xử lý hai rủi ro production:

1. Production Queue cũ chỉ nằm trong RAM và mất trạng thái sau restart.
2. Publish job đang ở `publishing` khi process/container dừng không thể biết chắc upload đã hoàn tất trên nền tảng hay chưa. Tự Retry có thể tạo video trùng.

## Durable Production Queue

`src/queue/production.ts` dùng bảng SQLite `production_queue` với:

- `draft_id` primary key;
- `owner_id` tenant isolation;
- `status`;
- `job_id`;
- `output`;
- `error`;
- `created_at` / `updated_at`.

Review/Approved/Rendering/Completed/Failed vì vậy vẫn còn sau restart và nằm cùng backup SQLite production.

## Publish recovery an toàn

Khi Publish Worker khởi động, mọi job còn `publishing` được chuyển thành:

`needs_reconcile`

Worker **không tự Retry** các job này.

Lý do: process có thể đã upload video thành công nhưng crash trước khi ghi `remote_id`/`published` vào SQLite.

## Quy trình Reconcile

Trên Publish Queue, job `NEEDS RECONCILE` có bốn lựa chọn.

### 1. Đã kiểm tra và video CHƯA tồn tại → Retry

Chọn `ĐÃ KIỂM TRA • RETRY` chỉ sau khi mở YouTube Studio/nền tảng tương ứng và xác nhận video chưa được tạo.

Job quay về `pending`. Số `attempts` không bị xóa.

### 2. Video đã tồn tại → Mark Published

Chọn `MARK PUBLISHED` và nhập remote/video ID đã xác minh. URL video là tùy chọn.

Hệ thống ghi job thành `published` mà **không upload lại**.

### 3. Đã xác minh upload thất bại → Mark Failed

Chọn `MARK FAILED`. Sau đó có thể dùng Retry thông thường nếu chưa vượt `maxAttempts`.

### 4. Không muốn tiếp tục → Cancel

Chọn `CANCEL` sau khi đã kiểm tra nền tảng.

## API

`GET /api/publish-jobs/:id/reconcile`

Trả trạng thái và cảnh báo reconcile.

`POST /api/publish-jobs/:id/reconcile`

Body:

```json
{
  "resolution": "retry | cancel | published | failed",
  "note": "operator verification note",
  "remoteId": "required when resolution=published",
  "remoteUrl": "optional https URL"
}
```

Mọi reconcile action được ghi vào Operator Audit Trail. Raw credential/token không được ghi.

## Safety invariant

- `needs_reconcile` không nằm trong due queue của Publish Worker.
- `needs_reconcile` chặn tạo publish job mới cho cùng render/platform.
- Retry/Cancel endpoint cũ không được phép bypass reconcile.
- `Mark Published` bắt buộc `remoteId`.
- Recovery không thay đổi `PUBLISH_LIVE_ENABLED`.
- Recovery không tự gọi provider API.

## Kiểm thử

```bash
npm run smoke:durable-queue
```

Smoke test xác nhận:

- Production Queue được lưu vào SQLite.
- Tenant listing đúng owner.
- `publishing` bị chuyển thành `needs_reconcile`.
- Duplicate publish bị chặn.
- Direct Retry bị chặn.
- Reconcile Retry hoạt động.
- Reconcile Mark Published lưu remote ID và không upload lại.
