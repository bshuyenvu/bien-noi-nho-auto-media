# Biển & Nỗi Nhớ Auto Media

Hệ thống tự động hoá sản xuất video tin tức ngắn tiếng Việt cho Biển & Nỗi Nhớ.

## V1

- Nhập tin từ URL, RSS hoặc thủ công
- AI Studio: biên tập tiêu đề, hook và kịch bản ngắn
- Lưu nguồn để kiểm chứng trước khi xuất bản
- TTS tiếng Việt
- Video dọc 1080x1920
- Subtitle và template TIN MỚI / TIN NÓNG
- Hàng đợi render, xem trước và duyệt
- Thư viện video


## Kiến trúc dự kiến

```text
Dashboard / News Collector / AI Studio
                 |
                 v
       Auto Video Engine
     TTS + HyperFrames + FFmpeg
                 |
                 v
       MP4 1080x1920 + Review
```

## Trạng thái

🚧 V1 đang được phát triển.
