# VietNewsFlow AI

**V1 Production • v6.4.0 • stable**

Nền tảng tự động hóa bản tin/video tiếng Việt với Multilingual Source Intelligence, Cross-Source Evidence Gate, Claim → Source Matrix, Evidence Review, Durable Review Gate, Production Queue, Stable Control, Autopilot, TTS, Smart Media, FFmpeg, Artifact Integrity, Consistency Audit và YouTube production gates.

> Safe-by-default: `PUBLISH_LIVE_ENABLED=false` và `YOUTUBE_PRIVACY_STATUS=private`. Việc bật LIVE/PUBLIC thật luôn phải đi qua Activation Wizard, Canary và Public Ramp.

## V1 Production chain

Source → Language Detection → Fact Engine → Cross-Source Evidence Gate → Claim → Source Matrix → Vietnamese Editorial → Draft → Evidence Review → Durable Review → Render/Profile binding → Immutable MP4 SHA-256 Manifest → Content Safety → Activation Gate → Public Ramp → Publish Queue → YouTube resumable upload → Remote Canary/Provenance → Monitoring/Consistency Audit.

- Evidence Gate phân loại `PASS / REVIEW / BLOCK` trước Editorial; `PASS` vẫn không bỏ qua Evidence Review và Durable Review.
- Claim → Source Matrix chỉ gắn nguồn đối chiếu khi Fact Engine chỉ ra đúng nguồn hỗ trợ; mapping mơ hồ bị giữ để người vận hành kiểm tra.
- Auto Producer dùng evidence bundle phía server, tenant-bound và consume một lần; browser không thể tự sửa matrix rồi hợp thức hóa approval.
- Review approval gắn với đúng phiên bản nội dung và render profile.
- File video bị sửa sau render sẽ bị quarantine trước provider.
- Trạng thái remote mơ hồ chuyển `needs_reconcile`, không retry mù.
- Public Canary/rollout, Kill Switch và Circuit Breaker chặn việc mở PUBLIC ngoài kiểm soát.
- Consistency Auditor chỉ tự sửa deterministic local state; lỗi remote-dependent giữ Release Gate `NO_GO`.
- YouTube là LIVE provider duy nhất trong V1; Facebook/TikTok dùng Safe Export Handoff và không có đường LIVE tự động trong release này.

Runbook phát hành: `docs/V1-PRODUCTION-RELEASE.md`.
Phase 6.1: `docs/PHASE-6-1-CROSS-SOURCE-EVIDENCE-GATE.md`.
Phase 6.2: `docs/PHASE-6-2-CLAIM-SOURCE-MATRIX.md`.
Phase 6.3: `docs/PHASE-6-3-INTEGRATION-HYGIENE.md`.
Phase 6.4: `docs/PHASE-6-4-PROVIDER-CAPABILITIES.md`.
Phase 6.6: `docs/PHASE-6-6-SAFE-EXPORT-HANDOFF.md`.
Phase 6.7: `docs/PHASE-6-7-FINAL-INTEGRATION.md`.

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
npm ci --no-audit --no-fund
npm run typecheck
npm run build
npm run smoke:multilingual-source
npm run smoke:evidence-gate
npm run smoke:claim-source-matrix
npm run smoke:v1-acceptance
npm start
```

Mặc định backend chạy ở `PORT=8787`.

## Phase 7 — Editorial Intelligence OS

Biên tập nguồn hiện đi qua Newsworthiness → Story Blueprint → Hook Studio → Master Story → Editorial Quality → Platform Adapter → Learning Loop.

Điểm chính:
- Hook Memory chống lặp theo owner và chấm Novelty/Truth/Retention/Clickbait Risk.
- AUTO duration tự chọn 45/60/90/120 giây theo mandatory claims.
- Không cắt script cơ học giữa câu; semantic compression phải giữ số liệu.
- Quality Gate kiểm tra mandatory claim coverage và ending completeness.
- Audience profiles: công chúng, y khoa, người bệnh, nhà đầu tư, social.
- Learning Loop dùng `storyId` server-side; client không được tự khai Hook strategy/angle.
- LLM lỗi/quota tự fallback về bản claim-safe.

Kiểm tra lõi: `npm run smoke:editorial-intelligence`. Kiểm tra provider thật tùy chọn: `EDITORIAL_LIVE_ENV_FILE=/path/to/.env npm run smoke:editorial-llm-live`.
