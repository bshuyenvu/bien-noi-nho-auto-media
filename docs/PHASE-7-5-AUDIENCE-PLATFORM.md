# Phase 7.5 — Audience & Platform Adaptation

## Mục tiêu
Dùng một Master Story thống nhất nhưng điều chỉnh cách truyền đạt theo người xem và nền tảng.

## Thành phần
- `src/editorial/platform-adapter.ts`
- Audience: general, medical, patient, investor, social.
- Platform: YouTube, Facebook, TikTok, Zalo và master.
- Mỗi output kế thừa claim IDs từ Master Story.
- Consistency check chặn claim lạ và xác minh mọi mandatory claim vẫn có mặt.

## UX
Auto Producer hỗ trợ AUTO duration và 30/45/60/90/120 giây, đồng thời cho chọn nhóm người xem trước khi biên tập.
