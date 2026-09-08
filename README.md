# VietNewsFlow AI

Nền tảng tự động hóa bản tin/video tiếng Việt với Review Gate, Production Queue, Stable Control, Autopilot, TTS, Smart Media và FFmpeg.

## Dell Wyse 5060 / RAM 4 GB

Nhánh tối ưu hiện dùng một render worker duy nhất, Resource Guard, Disk Guard và Low Memory Mode để tránh nhiều tác vụ nặng chạy đồng thời.

### Stable Control

- Pause/Resume queue.
- Theo dõi RAM, CPU, disk, output usage và stage hiện tại.
- Chỉ chạy một render job nặng tại một thời điểm.
- Tự dọn artifact cũ và bảo vệ dung lượng trống tối thiểu.
- Persistent queue trong SQLite.
- Retry với exponential backoff.
- Recovery job queued/rendering sau restart.

### Hard Recovery

Phase 2.3 bổ sung:

- `checkpoint_stage` và `interrupted_at` được lưu trong SQLite.
- `SIGTERM` / `SIGINT` chuyển job đang chạy về `queued` trước khi tiến trình thoát.
- FFmpeg có hard timeout và bị `SIGTERM`, sau đó `SIGKILL` nếu không thoát.
- TTS có timeout tác vụ để queue không chờ vô hạn.
- Watchdog có thể cắt FFmpeg khi stage `ffmpeg` bị stalled.
- Job được phục hồi từ payload đã persist khi container khởi động lại.

Biến môi trường quan trọng:

```env
LOW_MEMORY_MODE=true
RENDER_MIN_AVAILABLE_MB=512
RENDER_MIN_FREE_DISK_MB=2048
RENDER_MAX_OUTPUT_MB=8192
RENDER_MAX_ATTEMPTS=3
RENDER_RETRY_BASE_MS=15000
TTS_TIMEOUT_MS=300000
FFMPEG_TIMEOUT_MS=1800000
SHUTDOWN_GRACE_MS=5000
```

## Chạy dự án

```bash
npm install
npm run typecheck
npm start
```

Mặc định backend chạy ở `PORT=8787`.
