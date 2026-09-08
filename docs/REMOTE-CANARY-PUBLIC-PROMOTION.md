# Phase 5.3 — Remote Canary Verification & Public Promotion Gate

## Mục tiêu

Không cho phép operator `APPROVE PUBLIC` chỉ dựa vào remote/video ID đã ghi trong SQLite. Trước khi mở Public, hệ thống phải gọi trực tiếp YouTube Data API và xác minh video Canary thực tế.

## Bằng chứng bắt buộc

Nút `VERIFY REMOTE CANARY` gọi `videos.list` với `part=snippet,status,processingDetails` cho đúng video ID đã được ghi ở bước `UNLISTED VERIFIED`.

Promotion Gate chỉ PASS khi đồng thời:

- Video tồn tại bằng credential YouTube hiện tại.
- `snippet.channelId` trùng Channel ID đã OAuth/Test Connection.
- `status.privacyStatus = unlisted`.
- `status.uploadStatus = processed`.
- `processingDetails.processingStatus = succeeded`.
- Không có `failureReason`, `rejectionReason` hoặc `processingFailureReason`.
- Release Gate vẫn `GO`.
- Production Monitor không RED (được bao hàm bởi Release Gate).
- Không có publish job / upload session `needs_reconcile`.
- OAuth cached readiness còn hợp lệ.
- Kill Switch OFF.

Nguồn API chính thức:

- https://developers.google.com/youtube/v3/docs/videos/list
- https://developers.google.com/youtube/v3/docs/videos
- https://developers.google.com/youtube/v3/guides/implementation/videos

## Trình tự sau Phase 5.2

1. Hoàn tất `production-cutover.sh` tới `UNLISTED CANARY VERIFIED`.
2. Mở `Production Activation Wizard`.
3. Bấm `VERIFY REMOTE CANARY`.
4. Nếu YouTube vẫn đang processing, không approve Public; đợi rồi kiểm tra lại.
5. Nếu sai channel, privacy không phải Unlisted, upload rejected/failed hoặc processing failed: dừng promotion và điều tra.
6. Khi Remote Canary PASS, evidence được lưu vào SQLite.
7. Evidence mặc định có TTL 60 phút (`ACTIVATION_REMOTE_CANARY_MAX_AGE_MINUTES`).
8. Chỉ trong cửa sổ evidence còn mới, nút `APPROVE PUBLIC` mới được bật.
9. Operator vẫn phải nhập chính xác `APPROVE PUBLIC`.
10. Sau đó mới đổi `YOUTUBE_PRIVACY_STATUS=public` và recreate/deploy container theo runbook activation hiện có.

## Evidence lưu trong SQLite

Chỉ metadata đã lọc được lưu:

- `remoteCanaryVerifiedAt`
- `remoteCanaryVideoId`
- `remoteCanaryChannelId`
- `remoteCanaryTitle`
- `remoteCanaryPrivacyStatus`
- `remoteCanaryUploadStatus`
- `remoteCanaryProcessingStatus`

Access token, refresh token, OAuth client secret và resumable session URL không được lưu trong Activation state hoặc audit event.

## Khi nào evidence bị vô hiệu

Remote evidence bị xóa khi:

- ARM một activation session mới.
- AUTHORIZE UNLISTED lại.
- Thay video ID ở bước `UNLISTED VERIFIED`.
- ABORT activation.

Evidence cũng được xem là không hợp lệ nếu TTL hết hạn, Channel ID thay đổi hoặc video ID không còn khớp Canary hiện tại.

## Kiểm tra CLI

```bash
npm run prod:check
```

Output có dòng `Remote Canary promotion evidence` với trạng thái PASS hoặc `not verified / STALE/MISMATCH`.

## Nguyên tắc an toàn

Phase 5.3 không tự chuyển video sang Public và không tự sửa `.env`. Remote verification chỉ mở quyền cho operator thực hiện một quyết định Public thủ công; Production Kill Switch vẫn có ưu tiên cao nhất.
