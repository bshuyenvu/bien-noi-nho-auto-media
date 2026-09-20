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


## Phase 3B — Multi-output render

Phase 3B mở execution cho ba đầu ra có worker thật:

- **Short 9:16** → FFmpeg vertical 1080×1920.
- **Video 16:9** → FFmpeg landscape 1920×1080.
- **Podcast** → MP3 trực tiếp từ TTS worker; SRT vẫn được giữ cho downstream.

Cả ba dùng chung persistent render queue hiện hữu nên có retry, recovery sau restart, resource guard, storage guard và watchdog.

### Quy tắc generation batch

Khi không truyền `outputId`, hệ thống enqueue tất cả output đang được hỗ trợ trong project. Ví dụ `health-story`:

```
Short 9:16   -> queued
Video 16:9   -> queued
Podcast      -> queued
Comic        -> planned
Thumbnail    -> planned
```

Nếu truyền `outputId`, chỉ output đó được enqueue. Worker chưa hỗ trợ sẽ bị từ chối thay vì giả lập thành công.

### Acceptance

Landscape renderer phải vượt render thật trong Docker và được kiểm bằng `ffprobe`:

- codec H.264;
- width 1920;
- height 1080;
- duration hợp lệ;
- artifact có kích thước thực.

### Chưa bật

- Comic panels.
- Thumbnail/cover export.
- Remote image/video provider execution.
- Chia sẻ TTS asset giữa nhiều output trong cùng batch (mỗi render job hiện tự phục hồi độc lập).

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-phase3
npm run smoke:content-studio-landscape
```


## Phase 3C — Comic, cover & artifact registry

Phase 3C hoàn thiện bộ output mặc định của Content Studio mà không cần phụ thuộc provider ảnh bên ngoài.

### Output mới được bật

- **Comic**: panel PNG 1080×1080 theo từng scene + `comic-manifest.json`.
- **Thumbnail/Cover**: PNG 1280×720.
- Cả hai được tạo bằng renderer deterministic, nội dung nguyên bản và đánh dấu `rights=generated`.

### Artifact registry

Mọi artifact sau khi sẵn sàng được ghi vào `content_studio_artifacts` với:

- project / owner / output;
- loại artifact;
- path;
- quyền sử dụng;
- generator;
- metadata;
- thời điểm tạo.

API:

```
GET /api/content-studio-v2/projects/:id/artifacts
```

### Health Story package sau Phase 3C

```
Video 16:9  -> FFmpeg 1920x1080
Short 9:16  -> FFmpeg 1080x1920
Podcast     -> MP3
Comic       -> 1080x1080 PNG panels + manifest
Thumbnail   -> 1280x720 PNG
```

Research/Medical Review vẫn phải mở Generation Gate trước khi tạo bất kỳ output nào. Copyright Review và Human Final Review vẫn khóa trước publish.

### Acceptance

Comic/cover được render thật trong Docker, kiểm tra file PNG và manifest có kích thước thực. Remote AI image/video provider vẫn chưa được tự động kích hoạt nếu chưa có provenance contract.


## Phase 4A — AI Media Provider Router

Phase 4A chuyển media generation từ một bước chung thành **job cấp scene** có provider, retry và provenance riêng.

### Provider capability

- `local-original-card`: luôn READY, tạo keyframe PNG nguyên bản trên server.
- `remote-image-webhook`: chỉ READY khi có endpoint hợp lệ và `CONTENT_STUDIO_REMOTE_MEDIA_ENABLED=true`.
- `remote-video-webhook`: tương tự; yêu cầu scene đã có keyframe image READY.

Việc chỉ cấu hình endpoint **không tự bật execution**.

### Scene media job

Mỗi job lưu:

- project / owner / scene;
- image hoặc video;
- provider + model;
- prompt + negative prompt;
- continuity key;
- input keyframe;
- seed;
- output path / remote asset URL;
- cost theo micro-USD;
- attempts / retry;
- provenance JSON.

Job chạy độc lập nên một scene lỗi có thể retry mà không render lại toàn bộ tập.

### Remote provider contract

Request JSON:

```json
{
  "version": "content-studio-media-v1",
  "jobId": "...",
  "projectId": "...",
  "sceneIndex": 0,
  "kind": "image",
  "model": "...",
  "prompt": "...",
  "negativePrompt": "...",
  "continuityKey": "...",
  "inputArtifactPath": null,
  "inputArtifactData": null
}
```

Video request có `inputArtifactData` là data URL của keyframe, giới hạn 8 MB.

Response tối thiểu:

```json
{
  "assetUrl": "https://...",
  "model": "provider-model",
  "seed": "optional",
  "costUsd": 0.01,
  "provenance": {}
}
```

Có thể trả `costMicrousd` thay cho `costUsd`.

### API

- `GET /api/content-studio-v2/media-providers`
- `GET /api/content-studio-v2/projects/:id/scene-media-jobs`
- `POST /api/content-studio-v2/projects/:id/scene-media-jobs`
- `GET /api/content-studio-v2/scene-media-jobs/:jobId`
- `POST /api/content-studio-v2/scene-media-jobs/:jobId/run`
- `POST /api/content-studio-v2/scene-media-jobs/:jobId/retry`
- `POST /api/content-studio-v2/projects/:id/scene-media-jobs/run`

### Environment

```
CONTENT_STUDIO_REMOTE_MEDIA_ENABLED=false
CONTENT_STUDIO_IMAGE_WEBHOOK_URL=
CONTENT_STUDIO_IMAGE_WEBHOOK_TOKEN=
CONTENT_STUDIO_IMAGE_MODEL=
CONTENT_STUDIO_VIDEO_WEBHOOK_URL=
CONTENT_STUDIO_VIDEO_WEBHOOK_TOKEN=
CONTENT_STUDIO_VIDEO_MODEL=
CONTENT_STUDIO_REMOTE_MEDIA_TIMEOUT_MS=120000
```

Endpoint remote phải dùng HTTPS, ngoại trừ localhost runtime.

### Safety / provenance

- Vẫn bắt buộc Generation Gate trước khi tạo media job.
- Local fallback được ghi `rights=generated`.
- Remote result được tải về local trước khi đánh dấu READY.
- Mỗi output scene được ghi vào Artifact Registry.
- Prompt/model/seed/cost/continuity được giữ trong provenance.
- Copyright Review + Human Final Review vẫn khóa trước publish.

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-phase4
```


## Phase 4B — Generated media render handoff

Phase 4B nối output của Scene Media Provider Router vào render worker thật.

### Ưu tiên media theo scene

Renderer dùng thứ tự:

```
generated video READY theo scene
  -> generated image READY theo scene
  -> rights-verified remote media theo scene
  -> media chưa gắn scene
  -> original visual-card fallback
```

`RenderMediaItem` có thêm `sceneIndex` và `providerId`. Media không còn bị phân phối tuần tự bằng cách shift đơn giản khi đã có chỉ số scene.

### Generation endpoint

Khi gọi:

```
POST /api/content-studio-v2/projects/:id/generate
```

server tự đọc các scene media job ở trạng thái `READY`, chọn một asset tốt nhất cho mỗi scene (ưu tiên video hơn image) và truyền chúng vào persistent render payload.

Podcast không nhận visual media; video 16:9 và short 9:16 đều nhận cùng bộ generated scene media.

### Acceptance

Docker smoke xác minh:

- local keyframe PNG được tạo thật;
- keyframe có `rights=generated`;
- artifact registry có record tương ứng;
- `readySceneMediaForRender()` trả đúng `sceneIndex`;
- render job payload chứa đúng generated media path và scene index.

Nhờ vậy có thể retry/tạo lại riêng một scene rồi render lại project mà không cần thay toàn bộ media.


## Phase 5A — Project Pipeline Dashboard

Phase 5A bổ sung dashboard **read-only** để nhìn toàn bộ trạng thái một project mà không phải ghép thủ công nhiều API.

### Snapshot backend

`GET /api/content-studio-v2/projects/:id/dashboard` trả:

- Project/template/topic/series.
- Research, Medical, Generation, Copyright và Final Review gates.
- Scene media theo từng scene: image/video job, provider, model, status, attempts.
- Generation batch mới nhất và từng output.
- Artifact registry theo loại.
- Review events gần nhất.
- `nextAction` deterministic dựa trên trạng thái workflow.

`GET /api/content-studio-v2/dashboard?limit=20` trả danh sách project card rút gọn.

### Next Action

Các trạng thái có thể gồm:

```
prepare
fix-research
research-review
medical-review
retry-scene-media
run-scene-media
generate-keyframes
render
render-running
retry-render
copyright-review
final-review
ready
```

`nextAction` chỉ là chỉ dẫn workflow; Phase 5A **không tự chạy** hành động và không bỏ qua gate.

### UI V3.5

Panel **Content Studio V2 • Project Pipeline** được thêm vào workspace chính:

- chọn project;
- overall status;
- next action;
- 5 gate cards;
- scene media coverage;
- output/render status;
- artifact counts.

Panel luôn hiển thị như một tác vụ chính, tương thích desktop/mobile, và giữ toàn bộ UI cũ.

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-dashboard
npm run smoke:ui
```


## Phase 5B — Actionable Dashboard

Phase 5B biến dashboard read-only thành **operator-controlled workflow**.

### Nút kỹ thuật có thể chạy

`POST /api/content-studio-v2/projects/:id/dashboard/action` chỉ thực hiện action hiện tại do backend tính toán:

- `prepare`
- `generate-keyframes`
- `run-scene-media`
- `retry-scene-media`
- `render`
- `retry-render`
- `render-running` chỉ refresh trạng thái

Client không truyền tên action đích nên không thể nhảy qua gate.

### Human review vẫn tách riêng

Dashboard không tự ACCEPT:

- Medical Review
- Research/Evidence Review
- Copyright Review
- Human Final Review

Copyright/Final có endpoint riêng:

```
POST /api/content-studio-v2/projects/:id/release-review/copyright
POST /api/content-studio-v2/projects/:id/release-review/final
```

Payload:

```json
{
  "status": "accepted",
  "note": "Đã kiểm tra artifact và provenance."
}
```

`needs_fix` bắt buộc có ghi chú. Final chỉ ACCEPT sau khi Copyright đã ACCEPT. Copyright/Final không thể ACCEPT nếu project chưa có artifact.

### UI

Project Pipeline panel có **CHẠY BƯỚC TIẾP**, trạng thái thao tác, và form Human Review khi workflow tới Medical/Copyright/Final. Quyết định review được ghi audit trail.

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-dashboard
npm run smoke:content-studio-v2-actions
npm run smoke:ui
```


## Phase 5C — Safe Auto-Advance

Phase 5C bổ sung chế độ **TỰ CHẠY ĐẾN GATE**.

Backend lặp các action kỹ thuật hợp lệ tối đa một số bước giới hạn và tự dừng khi gặp:

- Research/Evidence cần người duyệt;
- Medical Review;
- Copyright Review;
- Human Final Review;
- render đang chạy;
- pipeline đã sẵn sàng;
- action không thể tiếp tục.

Endpoint:

```
POST /api/content-studio-v2/projects/:id/dashboard/auto-advance
```

Payload:

```json
{
  "skipExternalPrepare": false,
  "maxSteps": 8
}
```

Response có `trace`, `performedSteps`, `stoppedOn` và dashboard snapshot mới nhất.

### Safety

Auto-Advance không thể ACCEPT review và không tự publish. Nó chỉ gọi Action Executor đã được gate-aware ở Phase 5B.

### UI

Dashboard có thêm nút **TỰ CHẠY ĐẾN GATE** bên cạnh **CHẠY BƯỚC TIẾP**. Khi tới human review gate hoặc render đang chạy, nút tự động bị khóa.

### Verify

```bash
npm run typecheck
npm run build
npm run smoke:content-studio-v2-auto-advance
npm run smoke:ui
```
