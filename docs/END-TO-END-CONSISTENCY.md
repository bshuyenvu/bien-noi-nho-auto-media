# Phase 5.9 — End-to-End Consistency & Recovery Audit

## Mục tiêu

Auditor đối chiếu chuỗi production sau restart/crash:

`Draft → Review → Production Queue → Render → Artifact Manifest → Publish Job → YouTube Upload Session / Remote provenance`

Chỉ các sai lệch **deterministic và hoàn toàn local** mới được tự repair. Mọi trạng thái có thể liên quan tới remote YouTube hoặc mất bằng chứng đều giữ nguyên để operator điều tra.

## Các blocker chính

- Render đang hoạt động/READY nhưng Draft nguồn đã mất.
- Render READY nhưng không có output path.
- Publish đang hoạt động nhưng thiếu Draft hoặc Render.
- LIVE publish đang hoạt động với Review approval stale.
- Publish marked `published` nhưng thiếu remote ID.
- Upload session ACTIVE nhưng publish job đã mất.
- Remote ID của upload session khác remote ID của publish job.
- LIVE target thiếu/quarantine Render Manifest.

Blocker làm Release Gate chuyển `NO_GO`.

## Các repair tự động được phép

Auditor chỉ tự sửa:

1. Tạo lại Production Queue row bị thiếu từ Draft hiện hữu.
2. Đồng bộ owner/title/status/job ID của Production Queue theo Draft + latest Render + Durable Review.
3. Upload session vẫn ACTIVE nhưng publish job đã terminal:
   - job `published` có remote ID → session chuyển `completed` bằng chính remote ID đã lưu local;
   - job `failed/cancelled` → session chuyển `failed`.

Không có network call trong repair.

## Những việc auditor KHÔNG tự làm

- Không xóa orphan Draft/Queue/Render evidence.
- Không Retry upload.
- Không Mark Published.
- Không đoán remote ID.
- Không resolve `needs_reconcile`.
- Không clear Kill Switch.
- Không thay đổi activation privacy hoặc Public Ramp stage.

## Lịch chạy

Mặc định:

```env
CONSISTENCY_AUDITOR_ENABLED=true
CONSISTENCY_AUDIT_INTERVAL_MS=300000
```

Auditor chạy lần đầu sau startup khoảng 20 giây và sau đó mỗi 5 phút. Kết quả được lưu trong:

- `system_consistency_runs`
- `system_consistency_issues`

## Production check

`npm run prod:check` hiển thị:

`End-to-end consistency: N blocker • M warning`

Ở strict mode, bất kỳ blocker nào đều làm check thất bại thông qua Release Gate.

## Kiểm thử

```bash
npm run smoke:consistency
```

Smoke test chứng minh:

- queue missing được phát hiện và phục hồi;
- queue metadata/status sai được sửa deterministic;
- active LIVE thiếu Render trở thành blocker;
- terminal publish + ACTIVE upload session được sửa local;
- lịch sử audit được lưu SQLite.

## Quy tắc sau sự cố

Sau restart/crash:

1. Không tự xóa DB/output.
2. Đợi recovery workers + consistency auditor chạy.
3. Chạy `npm run prod:check`.
4. Nếu Consistency có blocker, giữ LIVE đóng/Kill Switch nếu đã engaged.
5. Với `needs_reconcile` hoặc remote mismatch, dùng quy trình Reconcile hiện có; không chạy repair thủ công bằng SQL.
