# VietNewsFlow AI

**V1 Production • v6.4.0 • stable**

Nền tảng tự động hóa bản tin/video tiếng Việt với Multilingual Source Intelligence, Cross-Source Evidence Gate, Durable Review Gate, Production Queue, Stable Control, Autopilot, TTS, Smart Media, FFmpeg, Artifact Integrity, Consistency Audit và YouTube production gates.

> Safe-by-default: `PUBLISH_LIVE_ENABLED=false` và `YOUTUBE_PRIVACY_STATUS=private`. Việc bật LIVE/PUBLIC thật luôn phải đi qua Activation Wizard, Canary và Public Ramp.

## V1 Production chain

Source → Language Detection → Fact Engine → Cross-Source Evidence Gate → Vietnamese Editorial → Draft → Durable Review → Render/Profile binding → Immutable MP4 SHA-256 Manifest → Content Safety → Activation Gate → Public Ramp → Publish Queue → YouTube resumable upload → Remote Canary/Provenance → Monitoring/Consistency Audit.

- Evidence Gate phân loại `PASS / REVIEW / BLOCK` trước Editorial; `PASS` vẫn không bỏ qua Durable Review.
- Review approval gắn với đúng phiên bản nội dung và render profile.
- File video bị sửa sau render sẽ bị quarantine trước provider.
- Trạng thái remote mơ hồ chuyển `needs_reconcile`, không retry mù.
- Public Canary/rollout, Kill Switch và Circuit Breaker chặn việc mở PUBLIC ngoài kiểm soát.
- Consistency Auditor chỉ tự sửa deterministic local state; lỗi remote-dependent giữ Release Gate `NO_GO`.
- Facebook/TikTok LIVE chưa thuộc V1 production-approved path.

Runbook phát hành: `docs/V1-PRODUCTION-RELEASE.md`.
Phase 6.1: `docs/PHASE-6-1-CROSS-SOURCE-EVIDENCE-GATE.md`.

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

- `checkpoint_stage` và `interrupted_at` được lưu trong SQLite.
- `SIGTERM` / `SIGINT` chuyển job đang chạy về `queued` trước khi tiến trình thoát.
- FFmpeg có hard timeout và bị `SIGTERM`, sau đó `SIGKILL` nếu không thoát.
- TTS có timeout tác vụ để queue không chờ vô hạn.
- Watchdog có thể cắt FFmpeg khi stage `ffmpeg` bị stalled.
- Job được phục hồi từ payload đã persist khi container khởi động lại.

## Chạy và kiểm tra

```bash
npm install --no-audit --no-fund
npm run typecheck
npm run build
npm run smoke:multilingual-source
npm run smoke:evidence-gate
npm run smoke:v1-acceptance
npm start
```

Mặc định backend chạy ở `PORT=8787`.
