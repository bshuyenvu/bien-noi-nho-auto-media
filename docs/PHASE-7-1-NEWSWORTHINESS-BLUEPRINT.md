# Phase 7.1 — Newsworthiness & Story Blueprint

## Mục tiêu
Biến danh sách fact đã qua Evidence Gate thành kế hoạch biên tập trước khi viết câu chữ.

## Thành phần
- `src/editorial/newsroom.ts`
- Chấm từng claim theo loại fact, confidence, corroboration và source score.
- Phân loại `required`, `supporting`, `omitted` claim.
- Tự chọn `angle`, `narrative`, `centralQuestion`, `audience` và độ phức tạp.
- Đề xuất thời lượng 45/60/90/120 giây theo mật độ thông tin.

## Contract
Claim `uncertain` không được nâng thành fact bắt buộc. Mandatory claims phải đi xuyên suốt Master Story và Quality Gate. AUTO duration ưu tiên đủ nghĩa thay vì ép số từ.
