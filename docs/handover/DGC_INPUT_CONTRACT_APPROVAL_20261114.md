# Đối soát đầu vào: PDF và duyệt công nợ theo hợp đồng — v0.6.109

Owner yêu cầu hoàn thiện trọn luồng theo hợp đồng: lập biên bản, PDF và công nợ phải trả. Trước đây sau khi lưu PDF phải quay lại duyệt từng dòng; nay bản lưu dẫn trực tiếp đến màn kiểm tra duyệt toàn hợp đồng.

## Hành vi

- Chọn kỳ/hợp đồng/mạng, lập đủ dịch vụ chi tiết theo luồng hiện có; dịch vụ tổng chỉ tham chiếu.
- Xem và lưu PDF; có liên kết mở bản đã lưu ngay, không tự duyệt.
- Người có INPUT_RECON_APPROVE mở kiểm tra duyệt hợp đồng, xem đủ dòng và tổng theo sổ/tổng in PDF, xác nhận đối tác đã chốt rồi duyệt.
- Giữ nguyên AP đã duyệt, tạo các khoản thiếu trong một giao dịch. Lỗi một dòng hoàn tác cả lần; gửi lại cùng xác nhận không tạo thêm.
- Kết quả chỉ rõ khoản mới/sẵn có, dẫn người dùng đến Quản lý Công nợ → Công nợ phải trả. Không chi tiền.

## Kiểm soát và tương thích

Hai endpoint mới contract-approve-preview/contract-approve dùng quyền hiện hữu, tenant/Origin/CSRF, phạm vi hợp đồng/kỳ/mạng nghiêm ngặt. Server kiểm đủ nguồn lá, snapshot, nguồn hiện hành của dòng chờ, AP có sẵn, cùng PDF ACTIVE và bytes/checksum hợp lệ, biên nhận PDF khớp toàn bộ rowIds/sourceDigests. Digest chống dữ liệu cũ; khóa kỳ/công ty và biên nhận request bảo vệ thao tác đồng thời/replay. Dòng tổng có AP vẫn bị chặn để xử lý riêng.

Luồng mới chỉ dành hồ sơ native. Hồ sơ captured, API duyệt từng dòng cũ và GST giữ nguyên để tương thích; không tuyên bố mọi API cũ đều bị ép qua luồng nhóm. Không đổi công thức, làm tròn, mẫu in, PDF đã lưu, nguồn, tiền lịch sử, quyền, schema, biến môi trường hoặc cash.

## Kiểm tra đã chạy

- API build và web build đạt; unified web 69 kiểm tra đạt.
- InputRecon/AP: 418 assertions trên Windows và Linux Node22, CPU0.3/RAM512MB/heap192MB. Có đủ phạm vi, tenant/quyền/CSRF, PDF thiếu/sai/bytes thay đổi, nguồn cũ, partial AP, rollback bằng lỗi chèn dòng thứ hai, concurrent replay, không đổi tổng cũ/nguồn/PDF và không cash.
- 41 kiểm tra trình duyệt giả lập: từ lập đủ hợp đồng đến lưu PDF/duyệt nhóm/kết quả, quyền kế toán/duyệt, mobile390px và không tự gọi duyệt từng dòng.
- Tất cả dữ liệu kiểm thử là giả lập, DB dùng tạm; không duyệt AP hoặc lưu chứng từ trên host thật.

## Triển khai và nghiệm thu

Nguồn dgc/main, gói một website codex/dgc-deploy. Owner triển khai lại rồi mở mới trang. Theo [hướng dẫn](../DGC_INPUT_RECON_GUIDE.md), kiểm hợp đồng MARVEL có ba dịch vụ con, PDF đủ ba dòng không có dòng tổng cộng trùng; chỉ xác nhận duyệt khi đối tác đã chốt thật. Người chỉ có quyền tạo không được thấy nút duyệt. Kiểm công nợ tại tab Phải trả; quỹ/ngân hàng tiếp tục deferred.

Chưa có bằng chứng triển khai109 hoặc nghiệm thu nghiệp vụ thật. Không nhập lại sổ, tự duyệt hoặc gửi email thử.
