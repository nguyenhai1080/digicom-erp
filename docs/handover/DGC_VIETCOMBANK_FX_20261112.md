# Lấy tỷ giá Vietcombank — v0.6.107 — 12/11/2026

Owner chọn **chỉ lấy khi kế toán bấm nút**, không tiến trình định kỳ. Công thức cố định **USD/VND = (Mua chuyển khoản + Bán) / 2**, không dùng cột Mua tiền mặt.

## Thao tác

Vào **Cấu hình chung → Tỷ giá báo cáo**:

1. Bấm **Lấy tỷ giá Vietcombank**. ERP hiển thị ngày giờ ngân hàng công bố theo giờ Việt Nam, giá Mua chuyển khoản, giá Bán và kết quả bình quân.
2. Chọn **Kỳ áp dụng tỷ giá Vietcombank**. Đây là kỳ kế toán do người dùng chọn; ngày công bố của ngân hàng được lưu riêng.
3. Kiểm tra thông tin và tích xác nhận, rồi **Lưu tỷ giá Vietcombank cho kỳ mới**.

Kỳ đã có tỷ giá sẽ bị chặn ghi đè. Nếu kỳ áp dụng khác tháng công bố, có cảnh báo rõ: đây không phải số liệu cuối kỳ hoặc bình quân tháng đó. Kết quả giữ nguyên phần lẻ, không tự làm tròn thành VND nguyên. Người có REVENUE_VIEW được xem; REVENUE_FX_CREATE mới được lấy/lưu nguồn. Không cấp thêm quyền cho tài khoản thật.

Nguồn: [trang Vietcombank](https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/Ty-gia) có liên kết [XML chính thức](https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx). XML hiện dùng Transfer và Sell, DateTime dạng MM/DD/YYYY + AM/PM. Nguồn ghi rõ chỉ truy cập một lần mỗi 5 phút. ERP dùng cache nguồn tối đa 5 phút với khóa DB dùng chung giữa các worker; bấm lại không tạo truy cập ngân hàng mới trong thời gian này. Sau 5 phút, cần lấy lại trước khi lưu. Lỗi nguồn cũng có khoảng chờ, không âm thầm dùng bản cũ.

Nếu nguồn không truy cập được/không hợp lệ, ERP báo lỗi và không lưu tỷ giá kỳ. Vẫn giữ chức năng nhập tay như trước. Bảng ngân hàng có tính chất tham khảo; tỷ giá áp dụng được kế toán kiểm tra và xác nhận.

## Bảo toàn và chứng cứ

Không lịch chạy tự động, không env/cron/schema/dependency mới. Không cập nhật tỷ giá cũ, không nhập lại tỷ giá GST, không mặc định dùng tháng trước. Chỉ tạo configuration REVENUE_FX cho kỳ chưa có sau xác nhận. Không tính lại/chỉnh sửa Invoice, công nợ, đối soát đã lưu hay dữ liệu captured. Kỳ tỷ giá mới có thể được dùng cho báo cáo và hồ sơ mới theo luồng hiện hữu; không thay số tiền gốc.

Cache dùng key riêng VCB_USD_REFERENCE_CACHE_V1, không lẫn tỷ giá kỳ. Cấu hình kỳ và audit giữ hai mức giá, ngày công bố, thời gian lấy, công thức, URL nguồn, hash SHA256, người xác nhận; audit lưu XML nguồn đã dùng. Không lấy URL/tỷ giá tùy ý từ client. Giới hạn phản hồi128KiB, TLS cố định nguồn, không redirect, timeout12giây; chặn DTD/entity, thiếu/trùng USD, số sai định dạng, timestamp không hợp lệ và Transfer > Sell. Cảnh báo nguồn quá7ngày, không tự biến thành ngày hiện tại.

## Kiểm thử và giới hạn

API/web builds đạt. 41 kiểm tra parser/transport: đúng Transfer thay Buy, số lẻ3chữ số, nhóm dấu phẩy, AM/PM + múi giờ, dữ liệu lỗi/thiếu/trùng, XXE, quá dung lượng, HTTP/HTML/UTF8 lỗi. 48 route checks DB giả lập: quyền/Origin/CSRF, concurrency/cache5phút, tạo-only, token/digest, source-failure cooldown, không stale fallback, giữ nguyên cấu hình tháng01 và fingerprint các bảng ngoài config/audit. Network bị cấm trong bộ route test cuối cùng; dependency nguồn giả lập. Cả hai bộ đạt trên Windows và Linux Node22.23.4, CPU0.3/RAM512MB/heap192MB (runtime từ dist build local, dependency image giữ nguyên).

20 kiểm tra browser desktop/mobile: không tự fetch khi mở trang, xác nhận, công thức, cảnh báo khác tháng/đã có kỳ, failure clears quote, read-only và GST không lấy nguồn. Screenshot giả lập đã xem. 69 unified web/API checks đạt.

Đã đọc nguồn ngân hàng công khai để xác định định dạng/cột và giới hạn; có một lần chạy test đầu cấu hình injection sai đã đi qua adapter thật vào DB giả lập, sau đó sửa và chặn toàn bộ network trong route suite. Không có truy cập/ghi dữ liệu hoặc cấu hình host thật trong lượt này. Chưa xác nhận kết nối từ host sản xuất; lỗi mạng vẫn có đường nhập tay.

## Phát hành

Đẩy source dgc/main và generated single-site codex/dgc-deploy. Owner triển khai rồi kế toán mở Cấu hình chung → Tỷ giá báo cáo và chủ động lấy/kiểm tra/lưu kỳ mới. Không tự bấm lưu tỷ giá tài chính thật thay owner.

Owner cũng đã báo gửi email từ info@digicomjsc.com thành công, ảnh Gmail Inbox có Invoice và đối soát có dấu/chữ ký tháng10/2026. Đây là bằng chứng người nhận cụ thể trong ảnh, không xác nhận mọi người nhận hoặc phát hành Invoice/AR.
