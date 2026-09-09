# Phase 7.4 — Claim Coverage & Editorial Critic

## Mục tiêu
Chỉ cho phép bản cuối khi đủ claim bắt buộc, không lặp ý và có kết thúc trọn nghĩa.

## Thành phần
- `src/editorial/editorial-quality.ts`
- Coverage validator cho mandatory claims.
- Redundancy detector theo semantic overlap.
- Ending completeness và spoken-Vietnamese checks.
- Content Quality Score và danh sách vấn đề cụ thể.

## LLM Guard
LLM chỉ polish Story Blueprint đã khóa. Nếu bản AI làm mất mandatory claim, lặp quá mức hoặc Quality Gate không đạt, hệ thống giữ bản claim-safe thay vì chấp nhận output AI.
