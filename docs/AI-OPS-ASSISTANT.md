# Phase 4.7 — AI Operations Assistant

## Mục tiêu

AI Operations Assistant là lớp phân tích **READ-ONLY** cho Production Dashboard. Nó đọc snapshot đã được lọc từ Production Monitor, KPI 7/30 ngày, Audit Trail, Render Queue, Publish Queue và YouTube deployment readiness.

Assistant không có API/tool để Pause, Resume, Retry, Cancel hoặc Publish. Mọi thao tác có side effect vẫn phải dùng control hiện có và qua quyền admin.

## Chế độ mặc định trên Dell Wyse 5060 / RAM 4 GB

```env
OPS_ASSISTANT_LLM_ENABLED=false
```

Ở chế độ này assistant dùng Local Rules, không tải model local và không tạo thêm áp lực RAM đáng kể. Các câu hỏi được hỗ trợ tốt gồm:

- Vì sao render chậm?
- Có job nào đang kẹt hoặc failed không?
- YouTube đã sẵn sàng LIVE chưa?
- Publish gần đây có ổn không?
- RAM/CPU/disk đang có vấn đề gì?
- Có incident nào cần xử lý?
- Gần đây operator/system đã làm gì?
- Tối ưu Dell Wyse 4 GB thế nào lúc này?

## LLM enhancement tùy chọn

Có thể bật:

```env
OPS_ASSISTANT_LLM_ENABLED=true
```

Assistant sẽ ưu tiên provider đã cấu hình sẵn:

1. Gemini nếu có `GEMINI_API_KEY`.
2. Custom OpenAI-compatible nếu có đủ `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`.

Nếu provider timeout/lỗi/JSON không hợp lệ, assistant tự fallback sang Local Rules. LLM chỉ nhận context vận hành đã lọc, không nhận OAuth token, API key, SMTP password hoặc publisher credential.

Không khuyến nghị bật local LLM lớn trên Wyse 4 GB trong lúc render.

## API

### Status

`GET /api/admin/ops-assistant/status`

Chỉ admin. Trả về safety contract, mode và trạng thái LLM.

### Ask

`POST /api/admin/ops-assistant/ask`

```json
{
  "question": "Vì sao hôm nay render chậm?"
}
```

Response gồm `severity`, `summary`, `findings`, `recommendations`, `evidence`, `readOnly=true` và mode `rules|llm`.

Câu hỏi giới hạn 3–600 ký tự.

## Audit

Mỗi lần hỏi được ghi một audit event `ops.ask` nhưng **không lưu nội dung câu hỏi**. Audit chỉ lưu intent, severity, mode, provider và độ dài câu hỏi để giảm nguy cơ người vận hành vô tình đưa thông tin nhạy cảm vào log.

## Production check

`npm run prod:check` xác minh:

- endpoint assistant hoạt động;
- `readOnly=true`;
- `noSideEffects=true`.

Ở strict mode, vi phạm safety contract làm production check fail.

## Kiểm thử

`npm run smoke:ops-assistant` xác nhận:

- phân loại câu hỏi job kẹt và YouTube readiness;
- trả lời ở Local Rules khi LLM tắt;
- không thay đổi số lượng Render/Publish jobs;
- giới hạn độ dài câu hỏi;
- safety status luôn read-only/no-side-effects.
