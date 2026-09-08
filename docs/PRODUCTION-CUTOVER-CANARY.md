# Phase 5.2 — Production Cutover & Unlisted Canary

Mục tiêu của bước này là đưa một release đã qua CI từ trạng thái production-safe sang **UNLISTED CANARY VERIFIED** trên Dell Wyse, nhưng **không tự động bật PUBLIC**.

## Lệnh vận hành

```bash
bash scripts/production-cutover.sh
```

Script yêu cầu host có Git, Docker Compose v2, `awk`, `grep`, `curl` và file `.env`. Việc đọc/ghi JSON được thực hiện bằng Node bên trong container; host không cần `jq` hoặc Node.

## Chuỗi cutover

1. Đặt `PUBLISH_LIVE_ENABLED=true` nhưng giữ `YOUTUBE_PRIVACY_STATUS=private`.
2. Chạy `deploy-wyse.sh`; deploy tự backup SQLite, giữ rollback image và health-check.
3. Xác minh Kill Switch đang OFF.
4. Chạy YouTube OAuth `TEST KẾT NỐI`. Nếu token/kênh không hợp lệ, script dừng an toàn để operator OAuth lại trên dashboard rồi chạy lại cùng lệnh.
5. Ghi nhận backup của deploy vào Activation Wizard.
6. Nếu chưa có Private Test hợp lệ, chọn một render `ready` riêng và chạy forced-PRIVATE deployment test.
7. Kiểm tra Release Gate phải `GO`.
8. ARM Production Activation ở mức `PRIVATE`.
9. `AUTHORIZE UNLISTED`.
10. Chuyển `.env` sang `YOUTUBE_PRIVACY_STATUS=unlisted`, recreate container và chạy `prod:check` strict.
11. Dùng một render `ready` khác để tạo **UNLISTED CANARY**.
12. Chờ Publish Worker hoàn tất; nếu job `failed`, `needs_reconcile`, timeout hoặc có lỗi sau ARM, script cố gắng bật **Production Kill Switch** và dừng.
13. Lấy remote/video ID đã publish và ghi `UNLISTED VERIFIED` vào Activation Wizard.
14. Chạy strict production check lần cuối.
15. Tạo báo cáo JSON + Markdown trong `data/cutovers/`.
16. Dừng ở `UNLISTED VERIFIED`. **Không có lời gọi API APPROVE PUBLIC trong cutover script.**

## Video test

Nếu chưa từng hoàn tất Private Test, cần **hai render `ready` khác nhau**: một cho Private Test và một cho Unlisted Canary. Script tự chọn các render chưa từng có YouTube publish job không-terminal. Có thể chỉ định thủ công:

```bash
CUTOVER_PRIVATE_RENDER_JOB_ID=<render-private> \
CUTOVER_CANARY_RENDER_JOB_ID=<render-canary> \
bash scripts/production-cutover.sh
```

Nếu Private Test đã hợp lệ, chỉ cần một render `ready` cho canary.

## Resume sau khi dừng

State vận hành được lưu tại:

```text
data/cutovers/current.env
```

File này chỉ chứa cutover ID, stage, render/job ID và đường dẫn backup; không chứa credential. Chạy lại:

```bash
bash scripts/production-cutover.sh
```

Nếu activation đã ARM, script không reset session. Nếu Unlisted đã được xác minh, script chỉ tái tạo báo cáo và kết thúc.

Nếu Kill Switch đã được bật, script **không tự clear**. Operator phải kiểm tra incident/publish queue/reconcile và clear Kill Switch thủ công trong Production Activation Wizard.

## Báo cáo

Sau cutover thành công:

```text
data/cutovers/cutover-<UTC timestamp>.json
data/cutovers/cutover-<UTC timestamp>.md
data/cutovers/last-success.env
```

Báo cáo gồm release version/revision, Release Gate, backup reference, Private Test evidence, canary job/remote ID, Activation ceiling, environment privacy và Kill Switch state.

## PUBLIC

Sau Phase 5.2, trạng thái mong đợi là:

- `PUBLISH_LIVE_ENABLED=true`
- `YOUTUBE_PRIVACY_STATUS=unlisted`
- Activation `ARMED`
- `maxPrivacy=unlisted`
- `Unlisted verified = YES`
- `Public approved = NO`
- Kill Switch = OFF

Operator phải xem trực tiếp video canary trên YouTube. Chỉ khi nội dung, metadata, âm thanh, thumbnail/khung hình và quyền riêng tư đều đúng mới dùng nút **APPROVE PUBLIC** trong Production Activation Wizard. Cutover script không thực hiện bước đó.

## Khi có lỗi

- Trước ARM: script dừng, production publish vẫn bị Activation Guard khóa.
- Sau ARM: lỗi không mong đợi sẽ kích hoạt Kill Switch best-effort.
- `needs_reconcile`: không retry mù; xác minh YouTube từ xa trước.
- Container không lên: dùng rollback/runbook Wyse hiện có.
- Kill Switch API không truy cập được: kiểm tra container/log ngay; không tiếp tục cutover.
