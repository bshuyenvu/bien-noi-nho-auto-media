# Health Content Studio V1

Health Content Studio là workflow chuyên biệt để tạo video sức khỏe nguyên bản, dựa trên bằng chứng và không tự sử dụng media bên thứ ba khi chưa xác minh quyền.

## Luồng V1

1. Người vận hành nhập chủ đề, URL nguồn y khoa chính, đối tượng và thời lượng.
2. Importer kiểm tra URL công khai và tính nhất quán title-body.
3. Source Intelligence khóa fact, Việt hóa nguồn và chấm authority/freshness/source score.
4. Foreign corroboration + Evidence Gate tạo Claim → Source Matrix và Prepared Evidence Bundle.
5. Editorial Professional V2 tạo canonical headline/hook/script từ fact đã khóa.
6. Originality Gate kiểm tra độ giống nguồn.
7. Medical Safety Gate kiểm tra tuyên bố điều trị tuyệt đối, chẩn đoán cá nhân, liều thuốc và ngữ cảnh cấp cứu.
8. Copyright Safe Mode không tự lấy ảnh/video của nguồn. Khi không có media hợp lệ, render dùng visual cards/typography nguyên bản.
9. Chỉ bản vượt gate mới được tạo Draft. Draft vẫn phải qua Evidence Review + Durable Review trước render.

## Medical Safety Gate

- `pass`: không phát hiện tín hiệu cần chặn/review bổ sung.
- `review`: có liều thuốc/chỉ dẫn điều trị cụ thể, claim bất định hoặc nội dung cấp cứu cần rà soát.
- `block`: tuyên bố tuyệt đối kiểu chữa khỏi chắc chắn, chỉ dẫn tự thay đổi điều trị, chẩn đoán cá nhân trực tiếp hoặc nội dung không đủ tín hiệu y khoa/evidence.
