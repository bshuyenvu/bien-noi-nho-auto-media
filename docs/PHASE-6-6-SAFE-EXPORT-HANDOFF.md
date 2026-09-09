# Phase 6.6 — Safe Multi-Channel Export Handoff

## Mục tiêu
Cung cấp đường xuất đa kênh hữu dụng mà không giả lập một LIVE provider chưa phù hợp hoặc chưa được xác minh.

Backend tạo ba artifact từ một render `ready`:
- MP4 render hiện hữu;
- caption `.txt`;
- manifest `.json` chứa nguồn, draft/render ID, release mode và operator-action flag.

## Safety contract
- Chỉ render thuộc đúng owner và trạng thái `ready` được export.
- Render path phải nằm trong `output/` và tồn tại dưới dạng file.
- Facebook/TikTok LIVE bị chặn ở API lẫn worker capability gate.
- Safe Export không gửi credential và không gọi API mạng xã hội.
- YouTube production path không thay đổi.

Endpoint: `POST /api/export-handoff`.
Frontend: Publish Scheduler → `TẠO SAFE EXPORT HANDOFF`.
