# Phase 7.3 — Master Story & Semantic Compression

## Mục tiêu
Không còn cắt bài cơ học theo số từ hoặc kết thúc giữa câu.

## Thành phần
- `src/editorial/master-script.ts`
- Một Master Story là nguồn duy nhất cho các bản 30/45/60/90/120 giây.
- Mandatory claims luôn được giữ; supporting claims chỉ bỏ khi vượt content budget.
- Nếu preset quá ngắn cho mandatory claims, hệ thống chọn bản dài hơn thay vì cắt claim.
- `semanticCompressClaim()` chỉ áp dụng biến đổi lossless, giữ marker số liệu và yêu cầu semantic overlap.
- Hook/closing claim được đánh dấu đã dùng để tránh lặp trong thân bài.

## Ending Guard
Mọi phiên bản phải kết thúc bằng câu hoàn chỉnh; không dùng dấu ba chấm do truncation cơ học.
