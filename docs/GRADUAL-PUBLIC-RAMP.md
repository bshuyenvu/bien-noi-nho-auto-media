# Phase 5.5 — Gradual Public Ramp & Rate Guard

## Mục tiêu

Sau khi Controlled Public Rollout đã `COMPLETED`, hệ thống không mở công suất PUBLIC tối đa ngay. Public Ramp giới hạn tốc độ đăng theo từng Stage và có Circuit Breaker bền vững trong SQLite.

## Stage mặc định

| Stage | Tối đa / 60 phút | Tối đa / ngày Việt Nam | Khoảng cách tối thiểu |
|---|---:|---:|---:|
| 1 | 1 | 3 | 60 phút |
| 2 | 2 | 6 | 30 phút |
| 3 | 3 | 12 | 20 phút |

Đây là giới hạn nội bộ của ứng dụng, không phải quota chính thức của YouTube. Quota API và giới hạn upload của kênh là các cơ chế riêng.

## Nguyên tắc an toàn

- Không auto-promote Stage.
- Không auto-reset Circuit.
- Rate Guard được kiểm tra hai lần: lúc enqueue và ngay trước Publish Worker upload.
- Nếu job đã xếp hàng nhưng tới giờ chạy vi phạm spacing/rate, Worker chuyển job sang `scheduled` ở thời điểm an toàn tiếp theo; không tiêu hao retry.
- Nếu Circuit đang OPEN, normal PUBLIC bị chặn.
- Private Test không tham gia Public Ramp. Public Canary của Phase 5.4 được tính như một lần PUBLIC exposure cho giới hạn 60 phút/ngày và khoảng cách tối thiểu, để lần PUBLIC đầu tiên sau rollout không bám sát Canary.
- `publish_privacy` được lưu trên từng publish job để lịch sử không phụ thuộc `.env` hiện tại.

## Circuit Breaker

Circuit mở ngay khi:

- xuất hiện `needs_reconcile` trong normal PUBLIC publish;
- YouTube trả lỗi rate/quota như `429`, `quotaExceeded`, `uploadRateLimitExceeded`, `uploadLimitExceeded` hoặc `rateLimitExceeded`;
- số lỗi mạng/5xx vượt `PUBLIC_RAMP_CIRCUIT_FAILURES` trong cửa sổ `PUBLIC_RAMP_CIRCUIT_WINDOW_MINUTES`.

Mặc định circuit cooldown 60 phút. Hết cooldown **không có nghĩa là tự mở**. Operator phải xác nhận production health sạch rồi bấm `RESET CIRCUIT`.

## Promote Stage

Dashboard → **Gradual Public Ramp** → `PROMOTE STAGE`.

Backend chỉ cho Promote khi:

1. Controlled Public Rollout đã hoàn tất;
2. Release Gate GO;
3. Monitor không RED;
4. không còn `needs_reconcile` / uncertain upload session;
5. Circuit CLOSED;
6. đủ `PUBLIC_RAMP_PROMOTE_STABLE_HOURS` kể từ lần bắt đầu stage hiện tại;
7. đủ `PUBLIC_RAMP_PROMOTE_MIN_SUCCESSES` normal PUBLIC thành công.

Operator phải nhập chính xác `PROMOTE PUBLIC RAMP`.

## Reset Circuit

Sau khi điều tra nguyên nhân và cooldown đã hết:

1. xác nhận Release Gate GO;
2. xác nhận Monitor không RED;
3. giải quyết toàn bộ Reconcile;
4. Dashboard → Gradual Public Ramp → `RESET CIRCUIT`;
5. nhập `RESET PUBLIC CIRCUIT`.

Mọi Promote/Reset đều được ghi Audit Trail.

## Kiểm tra CLI

```bash
npm run prod:check
```

CLI sẽ hiển thị Stage, usage 60 phút/ngày, khoảng cách tối thiểu và Circuit state. Với `PROD_CHECK_STRICT=true`, Circuit OPEN làm production check fail.

## Biến cấu hình

Các biến `PUBLIC_RAMP_STAGE1_*`, `PUBLIC_RAMP_STAGE2_*`, `PUBLIC_RAMP_STAGE3_*`, `PUBLIC_RAMP_PROMOTE_*` và `PUBLIC_RAMP_CIRCUIT_*` đã có trong `.env.example` và `docker-compose.yml`.

Sau khi sửa `.env` trên Wyse:

```bash
bash scripts/deploy-wyse.sh
```

Không hạ giới hạn quá nhanh chỉ để tăng throughput; Stage nên phản ánh lịch sử production ổn định thực tế.
