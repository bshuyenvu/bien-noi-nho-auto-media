# Phase 6.2 — Claim → Source Matrix + Evidence Review

## Mục tiêu

Phase 6.2 biến Evidence Gate từ một điểm số tổng hợp thành bằng chứng có thể kiểm tra ở cấp claim trước khi operator duyệt bản tin.

Pipeline:

`Source Intelligence → Evidence Gate → Claim → Source Matrix → Vietnamese Editorial → Draft + immutable evidence snapshot → Evidence Review → Durable Review → Render`

## Claim → Source Matrix

Mỗi fact có:

- `claimId`, loại fact, nội dung và confidence;
- đoạn trích ngắn từ PRIMARY;
- danh sách nguồn đối chiếu thực sự hỗ trợ claim;
- `mappingComplete` và `requiresReview`;
- số nguồn đối chiếu Fact Engine báo cáo so với số nguồn được ánh xạ cụ thể.

Fact Engine dùng `corroboratingSourceIndexes` 1-based tương ứng `C1..Cn`. Nếu model chỉ nói một claim đã được corroborated nhưng không chỉ ra nguồn cụ thể, hệ thống **không tự suy diễn**; claim được đánh dấu mapping chưa đủ.

## Server-side evidence bundle

Matrix và Evidence Gate không được tin cậy khi gửi lại từ browser. Auto Producer lưu một `prepared_evidence_bundle` trong SQLite, giới hạn owner và thời hạn, rồi chỉ trả `evidenceBundleId` cho frontend.

Khi draft được tạo:

1. backend kiểm tra bundle thuộc đúng owner;
2. bundle phải chưa hết hạn và chưa từng consume;
3. Source Intelligence phải tồn tại trong tenant đó;
4. matrix phải trỏ đúng Source Intelligence;
5. bundle được consume đúng một lần và chuyển thành evidence snapshot của draft.

## Evidence Review Gate

Draft có evidence snapshot không thể chuyển `approved/ready` nếu evidence chưa ở trạng thái `accepted`.

- `pending`: chờ operator kiểm tra;
- `needs_fix`: cần đối chiếu/sửa;
- `accepted`: đã xác nhận và cho phép Durable Review approval;
- Evidence `BLOCK` không thể được operator biến thành accepted;
- nếu còn claim chưa map đủ hoặc uncertain, operator phải để lại ghi chú xác minh có audit trail.

Draft thủ công/legacy không có evidence snapshot tiếp tục đi qua Durable Review Gate như V1 cũ để giữ tương thích.

## UI Review Workspace

Review hiển thị từng claim, confidence, PRIMARY excerpt, nguồn `C1..Cn`, cảnh báo mapping và lịch sử Evidence. Nút `DUYỆT BẢN TIN` bị khóa khi evidence snapshot chưa được xác nhận.

## Deployment safety

Private-first deployment dùng `PROD_CHECK_SCOPE=runtime`: kiểm tra health, monitor, consistency, durable resumable upload, content safety và các invariant runtime nhưng **không coi thiếu OAuth/LIVE activation là lỗi deploy**.

`PROD_CHECK_SCOPE=activation` vẫn là mặc định cho kiểm tra trước LIVE và vẫn yêu cầu Publisher configuration + Release Candidate GO. Không có khóa LIVE/PUBLIC nào bị nới lỏng.

## Test contract

`npm run smoke:claim-source-matrix` kiểm chứng:

1. exact claim → source mapping;
2. corroborated claim thiếu source index bị đánh dấu review;
3. prepared evidence bundle chỉ consume một lần;
4. evidence pending chặn approval;
5. accepted evidence mở approval;
6. thay evidence snapshot làm acceptance cũ mất hiệu lực;
7. audit events được persist.
