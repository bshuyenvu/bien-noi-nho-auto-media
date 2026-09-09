# Phase 7.6 — Editorial Learning Loop

## Mục tiêu
Học từ hiệu quả nội dung sau đăng nhưng không để client tự gán nhãn Hook/Angle làm sai dữ liệu học.

## Thành phần
- `src/editorial/editorial-learning.ts`
- `editorial_hook_history`: bộ nhớ Hook theo owner.
- `editorial_story_runs`: registry server-side khóa storyId, angle, Hook strategy, duration và quality.
- `editorial_performance`: retention/completion/share/comment metrics theo story thật.
- Strategy boost chỉ hình thành khi có đủ mẫu lịch sử.

## API
- `GET /api/editorial/learning`
- `POST /api/editorial/performance`

Performance API yêu cầu `storyId` UUID thuộc đúng owner; Hook strategy và angle được lấy từ story registry thay vì tin dữ liệu do client gửi.
