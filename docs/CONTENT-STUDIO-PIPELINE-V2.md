# Content Studio Pipeline v2

Status: **alpha vertical slice**  
Branch: `feature/content-studio-pipeline-v2`

## Mục tiêu

Biến hệ thống hiện tại từ các công cụ rời rạc thành pipeline template-driven:

```
Idea / Script
  -> Research & Source Check
  -> Script
  -> Medical Review (health templates)
  -> Scene / Storyboard Plan
  -> Image / Video
  -> Voice / Subtitle
  -> Compose
  -> Copyright & Provenance Review
  -> Human Final Review
  -> Export / Publish
```

V2 không thay thế các module production đã ổn định. Nó làm lớp orchestration phía trên `research`, `health`, `studio`, `media`, `tts`, `video`, `queue` và review gates hiện có.

## Vertical slice 1

Đã bổ sung:

- Template registry tái sử dụng.
- Project persistence trên SQLite, tenant-bound theo `owner_id`.
- Scene planner deterministic để chia kịch bản thành story beats.
- Output profiles cho 16:9, 9:16, 1:1, podcast, comic và thumbnail.
- Gate bắt buộc cho research, medical review, copyright/provenance và human final review.
- REST API riêng dưới `/api/content-studio-v2/*`.
- Smoke test cho template registry, scene plan, output plan và tenant isolation.

## Templates ban đầu

| Template | Research | Medical review | Output chính |
| --- | --- | --- | --- |
| `health-story` | bắt buộc | bắt buộc | 16:9, 9:16, podcast, comic, thumbnail |
| `health-short` | bắt buộc | bắt buộc | 9:16, 16:9, thumbnail |
| `podcast-story` | tùy chọn | không | podcast, 16:9, teaser |
| `social-short` | tùy chọn | không | 9:16, 1:1 |
| `comic-episode` | tùy chọn | không | comic, cover |

## API

### GET /api/content-studio-v2/templates

Trả template registry và output profiles.

### POST /api/content-studio-v2/projects

Ví dụ payload:

```json
{
  "templateId": "health-story",
  "topic": "Nhận biết sớm đột quỵ",
  "seriesName": "Chuyện Sức Khỏe Quanh Ta",
  "episode": 2,
  "script": "Kịch bản hoàn chỉnh...",
  "sourceUrls": ["https://example.org/source"],
  "outputIds": ["video-16x9", "short-9x16", "podcast", "comic"]
}
```

API tạo project ở trạng thái `planned`, lưu toàn bộ plan JSON và chưa tự động render/publish.

### GET /api/content-studio-v2/projects

Liệt kê project thuộc tài khoản hiện tại.

### GET /api/content-studio-v2/projects/:id

Đọc một project; không thể đọc project của tenant khác.

## Nguyên tắc an toàn

- Health template không được bỏ qua Medical Review.
- Không tự động mở publish; human final review luôn bắt buộc.
- Media phải tiếp tục tuân thủ copyright/provenance gate hiện hữu.
- Prompt seed chỉ mô tả nội dung nguyên bản; không yêu cầu sao chép style/tác phẩm có bản quyền.
- V2 alpha chưa gọi provider tạo ảnh/video; đây là orchestration plan để ghép các provider hiện hữu ở phase tiếp theo.

## Kiểm tra

```bash
npm run typecheck
npm run smoke:content-studio-v2
```

## Phase tiếp theo

1. Nối V2 project vào Research/Evidence Gate hiện hữu.
2. Nối Scene Plan với ShotCraft + media generation/provider router.
3. Tạo Character & Style Bible theo series.
4. Nối voice/subtitle và FFmpeg composer.
5. Bổ sung dashboard Project -> Storyboard -> Render -> Review -> Export.


## Phase 2 — Runtime orchestration

Phase 2 biến project plan thành runtime manifest có thể chuyển tiếp sang provider/render worker mà không tự động bỏ qua các review gate.

### Runtime artifacts

Mỗi project sau khi `prepare` có:

- **Research Snapshot**: nguồn official/academic, authority, topic entity match và trạng thái `PASS / REVIEW / BLOCK`.
- **Character Bible**: continuity key theo tập, anchor nhận diện nhân vật hư cấu và continuity rules.
- **Style Bible**: visual direction, ánh sáng, camera, typography và negative prompt chống logo/watermark/copied artwork.
- **Scene Prompt Pack**: image prompt + video prompt cho từng scene, gắn story beat và yêu cầu evidence.
- **ShotCraft Plan**: motion recipe, semantic timing, transition và QA.
- **Voice Plan**: auto-cast giọng, voice style và TTS → SRT.
- **Compose Plan**: output 16:9 / 9:16 / 1:1 / podcast / comic / thumbnail theo template.
- **Open Media fallback**: chỉ giữ candidate có quyền sử dụng đã xác minh; không auto-use external media.

### Health Story gate

```
Project
  -> Prepare
  -> Research PASS
  -> Medical Review ACCEPTED
  -> Generation Handoff
  -> Image/Video/TTS/Compose (phase tiếp theo)
  -> Copyright Review
  -> Human Final Review
  -> Publish
```

`Research REVIEW` hoặc `BLOCK` không mở Generation Gate. Medical Review không thể được ACCEPTED khi Research chưa PASS.

### API Phase 2

- `GET /api/content-studio-v2/projects/:id/runtime`
- `POST /api/content-studio-v2/projects/:id/prepare`
- `POST /api/content-studio-v2/projects/:id/medical-review`
- `GET /api/content-studio-v2/projects/:id/generation-handoff`

Medical Review payload:

```json
{
  "status": "accepted",
  "note": "Đã đối chiếu nội dung và Evidence Pack."
}
```

### Generation handoff

Generation handoff **không tự tạo hoặc publish nội dung**. Nó là hợp đồng dữ liệu giữa orchestration layer và media workers, gồm:

- prompt nguyên bản cho từng scene;
- continuity key + Character/Style Bible;
- ShotCraft plan;
- quyền media fallback đã xác minh;
- voice/subtitle plan;
- output profiles.

Media strategy mặc định:

```
generated-original
  -> rights-verified-open-media
  -> original visual card
```

Không có đường tự động dùng media không rõ bản quyền.

### Kiểm tra Phase 2

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2
npm run smoke:content-studio-v2-phase2
```

### Phase 3 dự kiến

1. Provider router cho image generation với provider capability contract.
2. Keyframe generation + provenance record cho từng scene.
3. Image-to-video worker giữ continuity key.
4. TTS/SRT worker theo Voice Plan.
5. FFmpeg multi-output composer.
6. Artifact manifest + copyright review sau render.
7. Project dashboard hiển thị trạng thái từng stage.


## Phase 3A — Media generation worker

Phase 3A đưa Generation Handoff vào worker thật nhưng chỉ bật execution cho đường đã có acceptance coverage: **Short 9:16**.

### Đã bật

- Capability registry cho image/video/voice/compose/export.
- Local original scene-card là fallback mặc định, rights-safe.
- TTS hiện hữu sinh MP3 + SRT.
- ShotCraft + FFmpeg vertical 1080x1920.
- Generation batch persistence theo owner/project.
- Chống enqueue trùng batch đang chạy.
- API theo dõi batch và trạng thái render job.

### Chưa bật execution

- 16:9 landscape: trạng thái `planned` cho đến khi có renderer + smoke test 1920x1080.
- Comic/thumbnail: giữ manifest, chưa export ảnh thật.
- Remote image/video provider: chỉ báo `configured` khi có webhook env; execution chưa bật cho đến khi có provenance contract.

### API

- `GET /api/content-studio-v2/generation-capabilities`
- `POST /api/content-studio-v2/projects/:id/generate`
- `GET /api/content-studio-v2/projects/:id/generation-batches`
- `GET /api/content-studio-v2/generation-batches/:batchId`

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-phase3
```
