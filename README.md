# VietNewsFlow AI

Nền tảng tự động hóa nội dung: RSS/URL → AI biên tập → Smart Media → Voice → Render video.

## Stable Control cho máy cấu hình thấp

Nhánh `wyse-4gb-resource-guard` bổ sung chế độ chạy ổn định cho Dell Wyse 5060 RAM 4 GB:

- Single-worker render queue.
- Resource Guard cho RAM/CPU.
- Disk Guard và tự dọn thư mục `output/`.
- Pause/Resume queue.
- Low Memory Mode.
- Persistent render queue bằng SQLite.
- Lưu `payload_json`, `attempts`, `max_attempts`, `next_attempt_at`, `updated_at` cho từng render job.
- Khôi phục các job `queued`/`rendering` sau khi container hoặc server restart.
- Retry theo exponential backoff; mặc định 3 lần với khoảng cơ sở 15 giây.
- Stable Control Dashboard hiển thị tài nguyên, queue, watchdog và số job được phục hồi.

### Biến môi trường chính

```env
LOW_MEMORY_MODE=true
RENDER_MIN_AVAILABLE_MB=512
RENDER_MAX_LOAD_PER_CPU=0.85
RENDER_MIN_FREE_DISK_MB=2048
RENDER_MAX_OUTPUT_MB=8192
RENDER_OUTPUT_RETENTION_HOURS=72
RENDER_WATCHDOG_MS=1200000
RENDER_MAX_ATTEMPTS=3
RENDER_RETRY_BASE_MS=15000
```

## Chạy

```bash
npm install
npm run typecheck
npm start
```

Mặc định dịch vụ chạy ở cổng `8787` nếu không đặt `PORT`.
