# Production Analytics & KPI Dashboard

Phase 4.6 bổ sung thống kê vận hành 7/30 ngày cho Render và Publish trên cùng SQLite production.

## KPI chính

- Video render thành công / thất bại và Render Success Rate.
- Publish thành công / thất bại và Publish Success Rate.
- Render Queue Latency: từ lúc job được tạo đến lúc thật sự bắt đầu `rendering`.
- Render Processing Time: từ `rendering` đến `ready/failed`.
- Publish Queue Latency: từ lúc job đến hạn đến khi worker chuyển `publishing`.
  - Với job có lịch, thời gian chờ trước `scheduled_at` không được tính là queue latency.
- Publish Processing Time: từ `publishing` đến `published/failed`.
- Daily throughput theo múi giờ `Asia/Ho_Chi_Minh`.
- Breakdown publish theo YouTube / Facebook / TikTok.

## Timestamp instrumentation

SQLite migration thêm `started_at` và `completed_at` cho `render_jobs` và `publish_jobs`. Trigger SQLite tự ghi timestamp khi status thay đổi; worker không phải chứa thêm code đo thời gian.

Khi retry một job failed, timing của attempt trước được reset để attempt mới được đo riêng. Các job lịch sử không có `started_at` vẫn được dùng cho throughput/success rate, nhưng không được đưa vào queue/processing latency.

## API

```text
GET /api/admin/analytics?days=7
GET /api/admin/analytics?days=30
```

API luôn scope theo `accountId` hiện tại; tenant không đọc KPI của tenant khác.

## Dashboard

Panel `📊 Thống kê nhanh` có:

- 6 KPI cards;
- lựa chọn 7 ngày / 30 ngày;
- biểu đồ throughput theo ngày;
- publish breakdown theo platform;
- số job có timing đo trực tiếp.

Không dùng chart library bên ngoài để giữ frontend nhẹ cho Dell Wyse 5060 RAM 4 GB.

## Production check

```bash
npm run prod:check
```

Lệnh production check xác minh endpoint analytics 7 ngày cùng health, monitoring, audit và publisher readiness.
