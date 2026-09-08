# Phase 4.5 — Operator Audit Trail & Activity Timeline

## Mục tiêu

Audit Trail ghi lại các thao tác vận hành quan trọng mà không thay đổi logic render/publish hiện có. Timeline dùng múi giờ `Asia/Ho_Chi_Minh` ở giao diện và dữ liệu gốc vẫn lưu ISO UTC trong SQLite.

## Sự kiện được ghi

- Render Queue: pause, resume, cleanup, retry.
- Publish: create job, retry, cancel, YouTube Private Live Test.
- Monitoring: manual run, test external alert.
- Maintenance: start/end.
- Incident: ACK, silence, unsilence.
- Self-Heal: auto-pause và auto-resume Render Queue.
- Production deployment: deploy success và rollback revision.

## Quyền truy cập

`GET /api/admin/audit` yêu cầu role `admin`. Timeline trong dashboard tự ẩn với member.

`POST /api/admin/audit/deploy` cũng yêu cầu admin và được `deploy-wyse.sh` / `rollback-wyse.sh` gọi theo kiểu best-effort sau khi runtime healthy.

## Bảo vệ dữ liệu nhạy cảm

Metadata được lọc trước khi ghi SQLite. Các key liên quan token, secret, password, API key, authorization, cookie, credential, bearer, client secret, access token và refresh token được thay bằng `[redacted]`.

Audit không lưu OAuth credential, SMTP password, Telegram bot token hoặc webhook bearer token.

## Retention

Mặc định:

```env
AUDIT_RETENTION_DAYS=90
```

Giá trị tối thiểu thực tế là 7 ngày. Dữ liệu cũ hơn retention được dọn khi có audit event mới.

## Production check

```bash
npm run prod:check
```

Sẽ kiểm tra thêm Audit Trail API và hiển thị số event cùng retention hiện tại.

## Dashboard

Panel **Hoạt động gần đây** hiển thị tối đa 30 event gần nhất và có bộ lọc:

- Render
- Publish
- Maintenance
- Deploy
- System

Mỗi dòng gồm thời gian, actor, action, target và mô tả ngắn.
