# Phase 6.1 — Cross-Source Evidence Gate

## Mục tiêu

Bổ sung một lớp kiểm chứng độc lập giữa `Source Intelligence` và `Editorial` để hạn chế việc một nguồn đơn lẻ, claim confidence thấp hoặc dữ kiện chưa được đối chiếu đi thẳng vào kịch bản video.

## Pipeline mới

`Original Source → Language Detection → Fact Engine → Cross-Source Evidence Gate → Vietnamese Editorial → Draft → Durable Review Gate`

Evidence Gate không thay thế Durable Review Gate. Mọi nội dung dù Evidence `PASS` vẫn phải qua bước duyệt của người vận hành trước render/publish.

## Trạng thái

- `PASS`: nguồn/facts đạt ngưỡng bằng chứng để chuyển sang Editorial.
- `REVIEW`: được phép tạo draft nhưng UI và editorial context phải báo rõ cần kiểm tra thủ công nguồn/claim.
- `BLOCK`: dừng trước Editorial, không tạo nội dung biên tập từ evidence yếu.

## Thành phần điểm Evidence

Điểm 0–100 được tính từ:

- authority của nguồn;
- freshness;
- source score từ Phase 6.0;
- corroboration thực sự ở cấp claim;
- confidence/support của fact;
- penalty cho claim/uncertainty yếu.

Việc chỉ tìm thấy nhiều bài liên quan không tự động làm Evidence tăng mạnh. Corroboration chỉ có giá trị khi Fact Engine đánh dấu claim là `corroborated`.

## Quy tắc bảo vệ

- `translationStatus=pending` hoặc `readyForEditorial=false` → `BLOCK`.
- Không có fact hoặc không có claim đạt confidence tối thiểu → `BLOCK`.
- Nguồn authority thấp, không có đối chiếu và tổng điểm thấp → `BLOCK`.
- Evidence trung bình → `REVIEW`, không giả định là đúng.
- Evidence mạnh → `PASS`, nhưng vẫn giữ `reviewRequired=true`.

## Tích hợp Auto Producer

`prepareAutoNews()` chạy `evaluateSourceEvidence()` ngay sau Phase 6.0 Source Intelligence.

- `BLOCK`: API trả lỗi `Evidence Gate chặn Editorial`.
- `REVIEW`: thêm cảnh báo vào editorial body để người biên tập kiểm tra trước khi duyệt.
- `PASS`: tiếp tục pipeline như bình thường.
- Response `/api/auto-producer` có thêm `evidenceGate` để frontend hiển thị status/score.

## UI

Auto Producer hiển thị:

- Source score;
- số facts;
- số nguồn đối chiếu;
- `Evidence PASS/REVIEW` + score;
- trạng thái `CẦN DUYỆT` vẫn giữ nguyên.

## Test contract

`npm run smoke:evidence-gate` kiểm chứng:

1. nguồn authority cao + claim corroborated → `PASS`;
2. nguồn đơn lẻ mức trung bình → `REVIEW`;
3. nguồn chưa Việt hóa → `BLOCK`;
4. claim confidence thấp/uncertain → `BLOCK`;
5. CI chạy smoke này cùng Phase 6.0 và toàn bộ V1 Production safety suite.

## Production safety

Phase 6.1 không thay đổi các cơ chế đã khóa: Stable Control, Durable Queue, Review Gate, Artifact Integrity, Content Safety, Duplicate Guard, Activation Wizard, Private-first, YouTube Canary, Public Ramp và Kill Switch.
