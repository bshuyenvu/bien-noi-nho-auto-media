# Phase 7.2 — Hook Studio & Hook Memory

## Mục tiêu
Giảm Hook lặp về từ ngữ, cấu trúc và ý nghĩa nhưng vẫn giữ đúng fact.

## Thành phần
- `src/editorial/hook-studio.ts`
- `src/editorial/editorial-learning.ts`
- 9 chiến lược: direct, question, number, human, contrast, consequence, timeline, explainer, alert.
- Candidate từ rules và AI được chấm Truth, Novelty, Relevance, Clarity, Retention, Clickbait Risk.
- Hook gần đây được lưu theo owner và đưa vào similarity penalty.
- Số liệu mới không tồn tại trong claims bị loại.

## Resilience
AI Hook JSON lỗi có parser suy giảm an toàn; nếu provider lỗi/quota, rules candidates tiếp tục hoạt động. Hook có similarity cao hoặc clickbait risk cao không được ưu tiên.
