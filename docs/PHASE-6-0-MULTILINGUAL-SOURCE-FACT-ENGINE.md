# Phase 6.0 — Multilingual Source + Fact Engine

## Mục tiêu

VietNewsFlow AI có thể tiếp nhận nguồn ở nhiều ngôn ngữ nhưng mọi nội dung đi vào Editorial phải được chuẩn hóa thành tiếng Việt tự nhiên, có provenance và không được dịch máy từng chữ rồi đưa thẳng vào video.

## Pipeline bắt buộc

`Original Source → Language Detection → Source Authority/Freshness → Fact Engine → Vietnamese Factual Brief → Editorial Room`

## Nguyên tắc an toàn

- Giữ nguyên title/body nguồn gốc để truy vết.
- Nguồn nước ngoài không được đi thẳng sang `editNews()` nếu chưa có Vietnamese Fact Brief.
- Fact Engine chỉ được dùng dữ kiện có trong nguồn chính hoặc nguồn đối chiếu; không suy đoán.
- Claim chưa chắc chắn phải nằm trong `uncertainties`, không được biến thành fact.
- Nếu Gemini không khả dụng, nguồn tiếng Việt được rules fallback; nguồn nước ngoài bị chặn Editorial.
- Source Intelligence được cache theo `owner_id + source_url + body_hash` để tránh tốn AI và giữ tính nhất quán.

## Source Intelligence

Mỗi nguồn có:

- detected language / script
- translation status
- Vietnamese title / factual brief
- fact list + short source excerpt
- uncertainty / warnings
- authority score
- freshness score
- corroboration count
- source score /100
- provider (`gemini` hoặc `rules`)
- `readyForEditorial`

## Tích hợp

- Auto Producer dùng Fact Engine trước Editorial.
- URL Import trả Source Intelligence và dùng Vietnamese Factual Brief khi auto-edit.
- AI Edit thủ công cũng đi qua cùng gate.
- RSS API trả language + intelligence summary để UI hiển thị trạng thái Việt hóa.
- Release Gate kiểm tra bảng `source_intelligence` và hiển thị số nguồn ready/translated.

## Test contract

`npm run smoke:multilingual-source` phải kiểm chứng:

1. nhận diện Vietnamese/English/CJK cơ bản;
2. nguồn nước ngoài không có AI bị chặn;
3. Gemini trả Vietnamese brief thì Editorial được mở;
4. facts được chuẩn hóa;
5. lần gọi lặp lại dùng SQLite cache;
6. source score hoạt động với nguồn uy tín.

## Production policy

Phase 6.0 không thay đổi Publish Safety: Review Gate, Artifact Integrity, Content Safety, Duplicate Guard, Private-first, Activation Guard, Public Canary và Ramp vẫn giữ nguyên.
