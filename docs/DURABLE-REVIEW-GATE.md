# Phase 5.7 — Durable Review Gate & Approval Audit

## Mục tiêu

Review Gate là nguồn sự thật bền vững trong SQLite. Trạng thái `draft.status=approved` một mình **không còn đủ** để render hoặc publish.

Approval chỉ hợp lệ khi:

1. Có bản ghi `review_states` cho đúng owner/draft.
2. Bốn khóa `script/media/voice/scenes` đều bật.
3. `approval_hash` khớp SHA-256 của phiên bản draft hiện tại.
4. Nếu đã bind render profile, lần render/retry tiếp theo phải dùng đúng profile đã duyệt.

## SQLite

### `review_states`

Lưu trạng thái hiện tại:

- `draft_id`, `owner_id`
- `status`
- 4 review locks
- `content_hash`
- `approval_hash`
- `approved_at`, `approved_by`
- `render_profile_hash`, `render_profile_bound_at`
- `invalidated_at`, `invalidation_reason`
- `updated_at`

### `review_events`

Là lịch sử append-only của Review:

- approval
- review update
- approval invalidation
- render profile binding
- legacy recovery rejection

Xóa draft sẽ xóa current `review_states`, nhưng lịch sử `review_events` được giữ lại để phục vụ audit.

## Content version hash

`approval_hash` được tạo từ nội dung ổn định gồm:

- title
- body/script
- source URL
- source name
- primary image URL
- format

Nếu bất kỳ trường nào thay đổi sau approval, lần kiểm tra Review tiếp theo tự chuyển state về `needs_review`, xóa locks/approval/profile binding và ghi event `invalidated` với lý do `draft_content_changed`.

## Render profile binding

Approval khóa nội dung trước. Ở lần render đầu tiên sau approval, hệ thống bind thêm render profile gồm:

- voice / voice rate / voice style
- primary + additional media URLs
- auto media collection
- smart scenes + custom scenes
- template
- motion
- ticker mode/text/speed
- channel name
- breaking mode

Lần render sau với profile khác sẽ:

1. không tạo render job mới;
2. invalidate approval;
3. trả HTTP 409;
4. yêu cầu operator Review lại.

## Retry render cũ

`Retry` không được phép tái sử dụng payload cũ một cách mù quáng.

Trước Retry hệ thống kiểm tra:

- payload cũ còn tồn tại;
- `text/headline/source/sourceUrl/imageUrl` còn khớp draft hiện tại;
- approval hiện tại còn hợp lệ;
- render profile cũ còn khớp profile đã bind.

Nếu draft đã đổi, Retry bị chặn và approval bị invalidate với lý do:

`stored_render_payload_no_longer_matches_draft`

Operator phải Review lại rồi tạo render mới.

## Publish Worker revalidation

Review được kiểm tra hai lần:

1. khi operator enqueue publish;
2. ngay trước khi Publish Worker gọi provider.

Do đó một video đã được xếp lịch nhưng draft bị sửa trong lúc chờ sẽ không thể LIVE publish. Job được chuyển `failed` với thông báo approval đã hết hiệu lực.

Nếu job đó là Public Canary, fail-safe Controlled Public Rollout tiếp tục kích hoạt Kill Switch theo cơ chế hiện có.

## Actor

Manual Review lưu actor theo auth context, ví dụ:

- `clerk:<user-id>`
- `api_key:<account-id>`
- `legacy:<account-id>`

Autopilot dùng:

`system:autopilot`

Các integrity invalidation tự động dùng actor hệ thống như:

`system:review-integrity`

## Upgrade từ phiên bản cũ

Phiên bản cũ từng suy approval từ `draft.status` và tự khóa đủ 4 mục sau restart.

Phase 5.7 **không tin** cơ chế legacy này.

Nếu khi boot gặp draft có `status=approved/ready` nhưng không có durable approval evidence khớp nội dung:

- không tự approve;
- tạo/đưa Review state về `needs_review`;
- ghi event `legacy_recovery_blocked`;
- draft approved bị hạ về `draft` / Production Queue `waiting_review` khi phù hợp.

Đây là hành vi migration có chủ đích. Operator cần duyệt lại các draft legacy trước khi render/publish.

## Dashboard

Review Workspace hiển thị:

- `APPROVAL CURRENT` hoặc `APPROVAL HẾT HIỆU LỰC`;
- người duyệt;
- thời gian duyệt theo giờ Việt Nam;
- render profile đã bind hay chưa;
- lý do invalidation;
- 5 sự kiện Review gần nhất.

API `GET /api/drafts/:id/review` trả cả `review` và `history`.

## Release Gate

Release Gate yêu cầu tồn tại:

- `review_states`
- `review_events`

Nếu có LIVE publish job ở trạng thái `pending/scheduled/publishing/needs_reconcile` mà draft không còn approval current, Release Gate chuyển `NO_GO`.

## Backup / restore

Hai bảng Review nằm trong cùng SQLite production DB, vì vậy được bao gồm trong `backup-wyse.sh`, `VACUUM INTO` và rollback/restore drill hiện có.

Không lưu token, OAuth credential hoặc secret trong Review tables.

## Kiểm thử

```bash
npm run smoke:review-gate
```

Smoke test xác nhận:

- approval được lưu SQLite;
- actor và approval hash tồn tại;
- render profile binding bền vững;
- đổi profile làm approval mất hiệu lực;
- sửa draft làm approval mất hiệu lực;
- legacy approved không durable evidence không được phục hồi;
- retry payload cũ bị chặn;
- audit events được ghi đầy đủ.

## Quy tắc vận hành

Không sửa trực tiếp `review_states` để vượt gate. Nếu approval hết hiệu lực, chỉnh nội dung/profile đúng ý định, mở Review Workspace, khóa lại bốn thành phần và duyệt lại.
