# Phase 4.4 — Maintenance Mode + Incident ACK/Silence

## Mục tiêu

Giảm nhiễu cảnh báo trong lúc bảo trì/deploy nhưng vẫn giữ các cơ chế bảo vệ tài nguyên hoạt động. Maintenance **chỉ mute cảnh báo bên ngoài**; nó không tắt Self-Heal, không thay đổi `PUBLISH_LIVE_ENABLED`, không sửa OAuth credential và không đổi visibility của video.

## Maintenance window

Dashboard có mục **Maintenance & Incident Ops**.

- `BẢO TRÌ 30 PHÚT`: mở maintenance toàn hệ thống.
- `KẾT THÚC BẢO TRÌ`: đóng maintenance sớm.
- Nếu operator quên đóng, cửa sổ tự hết hạn theo `endsAt`.
- Chỉ tài khoản `admin` mới được bật/tắt.

Cấu hình:

```env
MAINTENANCE_DEFAULT_MINUTES=30
MAINTENANCE_MAX_MINUTES=240
```

API nội bộ:

- `GET /api/admin/monitoring/maintenance`
- `POST /api/admin/monitoring/maintenance`
- `DELETE /api/admin/monitoring/maintenance`

Ví dụ body khi mở maintenance:

```json
{"minutes":30,"reason":"Nâng cấp production"}
```

## Incident ACK

ACK chỉ có nghĩa là operator đã nhìn thấy và nhận trách nhiệm theo dõi incident. ACK **không tắt cảnh báo**.

- Nút `ACK` chỉ xuất hiện với operator/admin.
- Metadata được lưu: thời điểm ACK, người ACK, ghi chú.

API:

`POST /api/admin/monitoring/incidents/:id/ack`

## Incident Silence

Silence tạm mute cảnh báo bên ngoài cho đúng incident đó.

- Dashboard mặc định: `IM 60 PHÚT`.
- Silence tự hết hạn theo timestamp; không cần cron riêng.
- Nút `BẬT LẠI` bỏ silence trước thời hạn.
- Self-Heal vẫn hoạt động bình thường trong thời gian silence.

Cấu hình:

```env
INCIDENT_SILENCE_DEFAULT_MINUTES=60
INCIDENT_SILENCE_MAX_MINUTES=10080
```

API:

- `POST /api/admin/monitoring/incidents/:id/silence`
- `DELETE /api/admin/monitoring/incidents/:id/silence`

## Deploy một lệnh

`scripts/deploy-wyse.sh` thử bật maintenance trên container hiện tại trước khi backup/build/recreate. Sau khi bản mới qua health check và `prod:check`, script tự kết thúc maintenance.

```bash
bash scripts/deploy-wyse.sh
```

Cấu hình:

```env
DEPLOY_MAINTENANCE_MINUTES=30
```

Nếu phiên bản đang chạy quá cũ và chưa có Maintenance API, deploy vẫn tiếp tục. Từ lần deploy sau, maintenance wrapper sẽ hoạt động. Nếu deploy/rollback lỗi và script không thể đóng maintenance, cửa sổ vẫn tự hết hạn.

## Quy tắc an toàn

1. Maintenance không dừng monitor.
2. Maintenance không tắt Self-Heal.
3. Maintenance không thay đổi publisher/live settings.
4. ACK không đồng nghĩa với silence.
5. Silence chỉ ảnh hưởng external alerts của incident đó.
6. `TEST CẢNH BÁO` cố ý bỏ qua maintenance/silence để operator vẫn kiểm tra được Telegram/Webhook/Email.
7. Mọi endpoint thay đổi maintenance/ACK/silence đều yêu cầu role `admin`.

## Kiểm thử

```bash
npm run smoke:maintenance
npm run smoke:self-heal-alerts
npm run smoke:wyse-ops
npm run smoke:ui
```

`smoke:maintenance` kiểm tra: maintenance suppress alert -> ACK persistence -> incident silence suppress alert -> unsilence gửi lại -> maintenance hết hạn tự đóng.
