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
