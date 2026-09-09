# Phase 6.3 — Integration Hygiene & Deterministic Build

## Mục tiêu

Đồng bộ source/runtime/build contract trước khi mở rộng provider đa kênh. Phase này không thay đổi Publish Safety và không tự bật LIVE.

## Thay đổi chính

- Loại module không còn reachable từ runtime: `src/media/upload.ts`, `src/video/template.ts`.
- Bỏ dependency trực tiếp chỉ phục vụ module upload cũ.
- RSS Workspace mới là nguồn UI chính; base dashboard không còn polling hai API RSS ẩn mỗi 5 giây.
- Thêm `package-lock.json`; CI và Docker dùng `npm ci` để dependency deterministic.
- Dockerfile không chạy recursive `chown -R /app`; file được COPY với ownership đúng ngay từ đầu.
- `APP_REVISION` được đặt sau các layer dependency nặng, nên đổi commit không làm invalid cache FFmpeg/npm.

## Kết quả đo trên Dell Wyse

Sau khi cache được làm nóng, build cùng source nhưng đổi `APP_REVISION` giảm từ hàng phút xuống khoảng vài giây; toàn bộ dependency/FFmpeg layer được cache.

## Audit contract

- Không có module TypeScript tracked nào unreachable ngoài entrypoint có chủ đích.
- `git diff --check` sạch.
- `npm ci`, typecheck, build, Phase 6.0–6.2 smoke, UI smoke và V1 acceptance phải PASS.
- Runtime production chỉ được nâng revision sau private-first deploy + health check.

## Safety invariant

Phase 6.3 không thay đổi Activation Wizard, Artifact Integrity, Durable Review, Content Safety, Canary, Public Ramp, Kill Switch hoặc mặc định `PUBLISH_LIVE_ENABLED=false` / YouTube `private`.
