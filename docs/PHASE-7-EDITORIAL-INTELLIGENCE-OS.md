# Phase 7 — Editorial Intelligence OS

Phase 7 thay mô hình “một prompt viết lại tin” bằng pipeline newsroom nhiều lớp: Truth → Planning → Hook → Master Story → Quality → Platform → Learning.

## Luồng chuẩn
Source Intelligence → Evidence Gate → Newsworthiness → Story Blueprint → Hook Studio → Master Story → Editorial Critic → Platform Adapter → Review → Performance Learning.

## Definition of Done
- Không mechanical truncation ở đường Phase 7.
- Mandatory claim coverage = 100% trước khi Ready.
- Hook có memory/similarity guard và clickbait guard.
- AUTO duration được phép nâng thời lượng nếu dữ kiện bắt buộc quá nhiều.
- Mọi platform chỉ kế thừa claim IDs từ Master Story.
- Learning metrics gắn với story registry server-side theo owner.
- LLM lỗi JSON, 429 hoặc 5xx phải graceful fallback về bản claim-safe.
- Production publish safety của Phase 6 không thay đổi.

## Verification
CI chạy `smoke:editorial-intelligence`; live LLM smoke là kiểm tra vận hành tùy chọn vì phụ thuộc quota/provider bên ngoài.
