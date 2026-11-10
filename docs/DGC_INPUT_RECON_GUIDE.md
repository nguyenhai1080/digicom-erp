# Lập đối soát đầu vào theo hợp đồng

1. Vào **Quản lý đối soát → Đối soát đầu vào**. Chọn **Kỳ** và **Hợp đồng đầu vào** cần lập.
2. Ở **Nguồn chưa tạo**, kiểm tra dịch vụ, đối tác và cơ sở doanh thu. Nguồn phải được chốt ở đầu ra; hợp đồng Input phải đang hiệu lực và có liên kết đúng dịch vụ. Nếu thiếu tỷ giá, kế toán nhập tỷ giá đúng kỳ tại **Cấu hình chung → Tỷ giá báo cáo**, rồi trở lại tải lại danh sách.
3. Bấm **Lập đủ dịch vụ hợp đồng** tại một nguồn, hoặc đánh dấu nguồn rồi **Xem toàn bộ hợp đồng**. Hệ thống tự lấy đủ dịch vụ/nguồn cùng hợp đồng/kỳ/đối tác đầu ra, gồm cả các dòng ở trang khác và bản đã có. Kiểm tra đủ dịch vụ, tỷ lệ, thuế, FX và phải trả, đánh dấu xác nhận rồi **Tạo nháp đủ hợp đồng**. Bản cũ giữ nguyên, chỉ thêm nháp còn thiếu; không tạo từng dịch vụ rời. Nếu một dòng không hợp lệ, cả nhóm chưa được lưu.
4. Hệ thống chuyển sang **Đối soát đã tạo**. Bấm **Biên bản hợp đồng** ở một dòng để xem biên bản gộp các dòng đã tạo thuộc hợp đồng/kỳ đó. Kiểm tra danh sách đủ dịch vụ; chọn đúng ngày biên bản, bấm **Tạo PDF xem trước**, mở bản in rồi xác nhận **Lưu biên bản PDF**. Có thể mở lại từ liên kết **PDF** trên từng dòng.
5. Gửi bản in cho đối tác xác nhận theo quy trình của công ty. Khi đủ điều kiện, người có quyền chọn **Duyệt AP** ở từng dòng, xem số tiền rồi xác nhận. Công nợ xuất hiện tại **Quản lý Công nợ → Công nợ phải trả**. Tạo/lưu PDF không tự duyệt công nợ; duyệt chưa chi tiền.

Tỷ lệ và thuế lấy từ hợp đồng, cơ sở lấy từ doanh thu đầu ra đã chốt. Tỷ giá dùng đúng tháng, không tự chuyển tỷ giá tháng trước sang tháng mới. Khi nguồn/tỷ lệ/FX đổi sau xem trước, hệ thống yêu cầu xem lại. Bản nháp cũ có **Xem nguồn / cập nhật**; hồ sơ đã duyệt và số liệu chuyển từ hệ thống cũ không tự tính lại.

Biên bản VND hiển thị số nguyên từng dòng; công nợ giữ hai chữ số thập phân theo công thức hiện có. Tài liệu mới không sao chép chữ ký số từ bản tham khảo. Chức năng thu chi/quỹ/ngân hàng vẫn chờ thiết lập riêng.

Mẫu in v0.6.94 theo form đã gửi: khổ Letter ngang, bảng 8 cột ô gộp. PDF đã lưu trước đó được giữ nguyên; mở Biên bản, tạo PDF xem trước rồi lưu phiên bản mới để nhận mẫu mới. Tên pháp nhân lấy theo Cấu hình Invoice và hồ sơ đối tác.

Từ v0.6.95, thiếu nguồn đã chốt của một dịch vụ con hoặc chưa đủ các dòng đối soát thì không xuất biên bản. Thông báo chỉ rõ dịch vụ/phạm vi cần hoàn thiện; không tự điền số 0 hoặc phân bổ tiền từ dòng gộp.
