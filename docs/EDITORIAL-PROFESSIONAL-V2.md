# Editorial Professional V2

Editorial Professional V2 thống nhất toàn bộ luồng biên tập thành một **Editorial Master** duy nhất.

## Luồng chuẩn

`Source → Source Intelligence → Evidence → Story Blueprint → Hook Studio → Editorial Master → Review → Render`

- Studio, Review và Render luôn dùng cùng một draft canonical.
- Mọi chỉnh sửa AI hoặc thủ công trên draft hiện tại làm approval cũ hết hiệu lực và yêu cầu duyệt lại.
- Claim → Source Matrix chỉ phục vụ kiểm chứng; không phải nội dung phát.
- Publisher/source attribution bị loại khỏi headline, hook, script và caption.

## AI provider

Mỗi tài khoản có thể dùng Gemini hoặc OpenAI-compatible API.

- Gemini mặc định: `gemini-3.6-flash`.
- OpenAI-compatible hỗ trợ Responses API hoặc Chat Completions.
- API key lưu bằng credential vault; API/UI chỉ trả trạng thái đã cấu hình, không trả secret.
- Một bài giữ **single-provider affinity**: Fact Engine, Hook và Polish ưu tiên cùng provider; nếu provider thất bại, hệ thống giữ claim-safe fallback thay vì trộn model âm thầm.

## Media credit

- Không còn thanh `NGUỒN` chung trên video.
- Provenance của từng ảnh/video được lưu theo draft.
- Mỗi scene chỉ hiện credit nhỏ của media đang phát, ví dụ `Ảnh: Nature Medicine`.
- Khi không có source name, renderer có thể fallback về hostname của media URL.

## Release gates

Bắt buộc PASS trước production:

- TypeScript build/typecheck.
- Editorial Intelligence + Professional V2 smoke.
- Hai regression fixture thực tế: ung thư và dinh dưỡng trẻ em.
- Full production safety suite và V1 acceptance.
- Isolated FFmpeg scene-credit render.
- Docker isolated health/non-root/write/secret-encryption checks.
- Private-first deploy với `PUBLISH_LIVE_ENABLED=false` và YouTube `private`.
