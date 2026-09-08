# Phase 5.6 — Content Safety & Duplicate Publish Guard

## Mục tiêu

Normal PUBLIC chỉ được vào Public Ramp sau khi **Pre-Publish Content Safety** PASS. Guard này giảm nguy cơ Autopilot/RSS tạo hai video gần như cùng một bản tin rồi đăng lặp.

Private Live Test và Public Canary không đi qua duplicate guard này vì đã có gate riêng. Normal PUBLIC luôn bị backend kiểm tra, kể cả khi operator không bấm nút preflight trên giao diện.

## Checklist bắt buộc

1. Draft tồn tại và thuộc đúng owner.
2. Render đúng draft, trạng thái `ready`, có file output đọc được.
3. Tiêu đề đủ tối thiểu.
4. Nội dung đủ tối thiểu cho PUBLIC.
5. `source_url` nếu có phải là HTTP/HTTPS hợp lệ.
6. Tạo fingerprint title/body/source/video.
7. So sánh với các PUBLIC job đang hoạt động hoặc đã published trong cửa sổ chống trùng.
8. Chỉ khi PASS mới chạy Public Ramp Guard và enqueue.

## Fingerprint

- Title: SHA-256 sau normalize Unicode, bỏ dấu, lowercase và chuẩn hóa khoảng trắng.
- Body/script: SHA-256 theo cùng quy tắc.
- Source URL: bỏ fragment và tracking parameters phổ biến như `utm_*`, `fbclid`, `gclid`, sau đó SHA-256.
- Video: fingerprint nhẹ cho Wyse 4 GB bằng SHA-256 của `file size + sample đầu + sample cuối`; mặc định mỗi sample tối đa 512 KiB.

Fingerprint video không đọc toàn bộ file nên giảm I/O trên Wyse, nhưng vẫn phát hiện tốt file render giống hệt hoặc gần như được tái sử dụng nguyên vẹn.

## Near duplicate

Ngoài exact hash, title/body được tokenize và so bằng Jaccard similarity.

Mặc định:

- title lock threshold: `0.88`
- body lock threshold: `0.92`
- warning threshold: `0.75`
- duplicate window: `72 giờ`

Nếu exact title/body/source/video trùng, hoặc similarity vượt ngưỡng, normal PUBLIC bị chặn.

## Active duplicate protection

Fingerprint được ghi ngay khi một normal PUBLIC job được enqueue thành công. Job tiếp theo sẽ so với cả các trạng thái:

- `pending`
- `scheduled`
- `publishing`
- `needs_reconcile`
- `published`

Vì vậy hai nội dung trùng không thể cùng lọt vào Publish Queue rồi chờ job đầu đăng xong mới bị phát hiện.

## Dashboard

Trong **Publish Scheduling** có panel `🛡 Pre-Publish Checklist`.

Chọn render, nhập tiêu đề rồi bấm **KIỂM TRA**. UI hiển thị từng mục:

- `PASS`
- `WARN`
- `FAIL`

UI chỉ hỗ trợ quan sát. Backend vẫn chạy lại guard khi tạo normal PUBLIC job.

## API

```text
GET  /api/admin/content-safety
POST /api/admin/content-safety/preflight
```

Preflight body:

```json
{
  "renderJobId": "render-id",
  "title": "Tiêu đề đăng"
}
```

API không trả raw body fingerprint source data ngoài các hash/check cần thiết.

## Production check

```bash
npm run prod:check
```

CLI hiển thị duplicate window, title/body threshold và số fingerprint gần đây. Với `PROD_CHECK_STRICT=true`, Content Safety API không sẵn sàng sẽ làm production check fail.

Release Gate cũng yêu cầu bảng SQLite `publish_content_fingerprints` tồn tại.

## Biến cấu hình

```env
CONTENT_DUPLICATE_WINDOW_HOURS=72
CONTENT_DUPLICATE_TITLE_SIMILARITY=0.88
CONTENT_DUPLICATE_BODY_SIMILARITY=0.92
CONTENT_DUPLICATE_WARN_SIMILARITY=0.75
CONTENT_VIDEO_FINGERPRINT_SAMPLE_BYTES=524288
```

Cửa sổ dưới 24 giờ sẽ tạo warning trong Release Gate. Không nên giảm threshold hoặc window chỉ để tăng throughput.

## Khi nội dung bị block

1. Kiểm tra job ID được báo là duplicate.
2. So nguồn URL và nội dung draft.
3. Nếu đó thực sự là một tin mới, chỉnh source/title/body để phản ánh khác biệt thực tế và render lại.
4. Không chỉnh vài từ chỉ để vượt similarity threshold.
5. Nếu nội dung cũ đã hết duplicate window, chạy lại preflight trước khi enqueue.

Không có nút bypass duplicate guard trong Phase 5.6.
