# Phase 5.8 — Immutable Render Provenance & Artifact Integrity

## Mục tiêu

Mỗi video dùng cho LIVE publish phải có chuỗi bằng chứng:

`Draft → Approval Hash → Render Profile Hash → Render Payload Hash → MP4 SHA-256 → Publish Job → Remote ID`

Không có cờ bypass cho bước kiểm tra file trước provider YouTube.

## Render Manifest

Bảng `render_artifacts` lưu:

- `render_job_id`, `draft_id`, `owner_id`
- đường dẫn output
- SHA-256 của render payload
- approval hash và render-profile hash từ Durable Review Gate
- SHA-256 toàn bộ file MP4 và kích thước byte
- trạng thái `valid` / `quarantined`
- thời điểm tạo và lần verify gần nhất

Hash file được đọc theo stream nên không nạp toàn bộ video vào RAM, phù hợp Dell Wyse 4 GB.

## Tạo manifest

Watcher mặc định quét mỗi 5 giây và tạo manifest cho render `ready` chưa có manifest. Khi LIVE publish tới provider boundary mà manifest chưa có, provider sẽ tạo manifest từ render payload đã persist rồi verify ngay trước upload.

Biến vận hành:

- `ARTIFACT_MANIFEST_WATCHER=true`
- `ARTIFACT_MANIFEST_POLL_MS=5000`
- `ARTIFACT_MANIFEST_GRACE_MS=15000` — Release Gate cho watcher một cửa sổ ngắn trước khi coi manifest missing là blocker.

## Verify trước YouTube

Ngay trước `youtubeReadiness` và upload, provider kiểm tra lại:

1. render job vẫn `ready`;
2. output path không đổi;
3. Review approval vẫn current;
4. approval hash khớp manifest;
5. render-profile hash khớp manifest;
6. payload JSON hash khớp;
7. file MP4 hiện tại có đúng SHA-256 + size đã ghi.

Nếu bất kỳ mục nào sai:

- upload bị chặn trước provider;
- artifact được quarantine nếu manifest đã tồn tại;
- Production Kill Switch được bật;
- operator phải điều tra và không được tự clear Kill Switch bằng automation.

## Sau publish

Sau khi YouTube trả thành công, `artifact_publish_links` lưu `publish_job_id`, platform, remote ID/URL và đúng artifact SHA-256 đã được publish. Lỗi ghi provenance sau remote success chỉ được log; job không bị đổi thành failed để tránh upload trùng.

## Release Gate

Release Gate yêu cầu hai bảng provenance. Nó FAIL khi LIVE target đã quá grace window mà vẫn thiếu manifest hoặc đang trỏ tới artifact quarantined. Artifact quarantined cũ không còn gắn LIVE target chỉ tạo cảnh báo.

## Quy tắc vận hành

- Không sửa/ghi đè trực tiếp file `output/*.mp4` sau render.
- Nếu cần thay video, tạo render mới và Review lại.
- Không xóa manifest để né kiểm tra; provider sẽ tái tạo từ persisted payload và hash file hiện tại, nhưng approval/profile vẫn phải hợp lệ.
- Backup SQLite phải đi cùng thư mục output nếu cần phục hồi đầy đủ provenance.

## Kiểm thử

```bash
npm run smoke:artifact-integrity
```

Smoke test chứng minh file đúng PASS, sửa byte bị quarantine, khôi phục đúng bytes PASS lại, remote link được lưu và LIVE target thiếu manifest bị Release/Artifact snapshot phát hiện.
