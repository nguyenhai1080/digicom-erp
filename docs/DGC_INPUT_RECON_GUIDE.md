# Lập đối soát đầu vào theo hợp đồng

1. Vào **Quản lý đối soát → Đối soát đầu vào**, chọn **Kỳ**, **Hợp đồng đầu vào** và **Ngày biên bản**. Nếu hợp đồng có nhiều mạng đầu ra, chọn đúng mạng.
2. Bấm **Lập biên bản theo hợp đồng**. Không cần đánh dấu từng dịch vụ con. Hệ thống tự lấy đủ các dịch vụ chi tiết và báo rõ dòng tổng chỉ để tham chiếu, không cộng lần nữa.
3. Kiểm tra danh sách dịch vụ, cơ sở, tỷ lệ, thuế, tỷ giá và phải trả. Thiếu nguồn đã chốt của một dịch vụ thì chưa lập được; không dùng dòng tổng thay thế hoặc tự điền số 0. Nếu thiếu tỷ giá, kế toán nhập đúng kỳ tại **Cấu hình chung → Tỷ giá báo cáo**, rồi quay lại lập.
4. Xác nhận rồi **Lưu nháp và mở biên bản**. Nháp đã có được giữ nguyên, chỉ thêm phần thiếu; hệ thống tự mở biên bản chung. Nếu đã đủ nháp, chọn **Mở biên bản hợp đồng** để xem ngay.
5. Bấm **Tạo PDF xem trước**, mở PDF, kiểm tra đủ chi tiết và không cộng dòng tổng. Xác nhận **Lưu biên bản PDF** để lưu phiên bản mới.
6. Sau khi lưu, dùng **Mở biên bản PDF đã lưu** để kiểm tra bản chính thức. Người có quyền duyệt chọn **Kiểm tra duyệt công nợ hợp đồng** (hoặc **Kiểm tra duyệt hợp đồng** trong danh sách). Hệ thống kiểm tra đủ dịch vụ chi tiết, nguồn và cùng một PDF đã lưu.
7. Khi đối tác đã chốt biên bản, kiểm tra tổng theo sổ, tổng in PDF và những khoản đã duyệt; tích xác nhận rồi bấm **Duyệt công nợ toàn hợp đồng**. Khoản đã có được giữ nguyên, chỉ tạo phần còn thiếu; nếu một dòng lỗi thì toàn bộ lần duyệt được hoàn tác.
8. Kết quả cho biết số khoản mới/sẵn có. Tra cứu tại **Quản lý Công nợ → Công nợ phải trả**. Tạo nháp hoặc lưu PDF không tự duyệt; duyệt công nợ chưa phát sinh chi tiền.

Dòng tổng và tệp cũ vẫn được giữ trong hồ sơ, không cần xóa để lập lại PDF. Nếu dòng tổng đã có công nợ, hệ thống báo xung đột để xử lý riêng, không tự sửa số tiền thật. Nguồn thay đổi cần xem lại; hồ sơ đã chuyển và bản đã duyệt không tự tính lại.

Form v0.6.94 trở đi dùng Letter ngang, bảng 8 cột ô gộp. Tên pháp nhân lấy từ cấu hình Invoice/hồ sơ đối tác. PDF VND làm tròn từng dòng rồi cộng; sổ giữ hai chữ số thập phân. PDF đã lưu trước đó giữ nguyên; chủ động lập phiên bản mới để nhận mẫu và phạm vi mới. Quỹ/ngân hàng vẫn chờ thiết lập riêng.

Từ v0.6.97, nháp tổng cũ vẫn được nhận diện là tham chiếu dù dịch vụ tổng đã bỏ khỏi danh mục hợp đồng hiện hành. Không cần xóa nháp; mở lại Lập biên bản theo hợp đồng để lấy ba dòng chi tiết. Nếu còn lỗi về dòng khác, thông báo nêu mã hồ sơ/dịch vụ/nguồn cần kiểm tra.

Từ v0.6.109, luồng duyệt theo hợp đồng áp dụng cho hồ sơ mới. Hồ sơ đã chuyển từ hệ thống cũ vẫn dùng luồng lịch sử riêng, không đưa vào lần duyệt nhóm này. Khi nguồn hoặc PDF thay đổi, cần mở kiểm tra lại; gửi lại cùng lần xác nhận không tạo thêm công nợ.
