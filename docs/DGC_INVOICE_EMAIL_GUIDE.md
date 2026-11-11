# Gửi Invoice và đối soát qua email

Sau khi triển khai v0.6.105, người có INVOICE_VIEW + RECON_VIEW + INVOICE_ISSUE có nút **Gửi email Invoice và đối soát** ở kết quả tạo Invoice, và **Gửi email** tại mỗi Invoice đang hiệu lực trong Quản lý Invoice.

1. Mở nút gửi. Chọn một hoặc nhiều Invoice cùng đối tác/kỳ. Invoice nháp được ghi rõ là nháp; gửi email không tự phát hành hoặc tạo công nợ.
2. Chọn nhân viên hoặc liên hệ đối tác trong danh bạ; có thể nhập thêm địa chỉ, phân cách bằng dấu phẩy/chấm phẩy. Có To và Cc. Người nhận To/Cc sẽ nhìn thấy các địa chỉ này; kiểm tra kỹ khi gửi cho đối tác.
3. Sửa tiêu đề/nội dung, bấm **Kiểm tra email và tệp đính kèm**. Mở các liên kết PDF để kiểm tra nếu cần.
4. Kiểm tra toàn bộ danh sách PDF, trạng thái nháp và cảnh báo thiếu tệp nguồn. Xác nhận rồi bấm **Gửi email**.
5. Xem lịch sử gửi tại cùng màn hình. Máy chủ thư tiếp nhận không có nghĩa thư đã đến hộp thư hoặc đã được đọc. Nếu gửi một phần hoặc chưa rõ kết quả, kiểm tra hộp thư/quản trị viên trước khi gửi lại; không gửi lại cho tất cả người nhận một cách tự động.

## Chứng từ đính kèm

- Dùng chính PDF Invoice đã lưu và PDF đối soát đầu ra đã chốt được liên kết qua doanh thu/phạm vi Invoice. Không tạo lại PDF hoặc tính lại số tiền.
- Chỉ cùng một công ty, đối tác và kỳ. Một PDF liên kết với nhiều dòng dịch vụ chỉ đính kèm một lần.
- Không tự lấy đối soát đầu vào của nhà cung cấp khác để gửi cho khách hàng. Các tài liệu đó có thể chứa chi phí/tỷ lệ chia sẻ riêng.
- Với nguồn nhập tay không có PDF hoặc nguồn lịch sử thiếu tệp đã liên kết, có cảnh báo rõ; không thay bằng tệp đoán theo tên. Người gửi cần kiểm tra cảnh báo trước khi xác nhận.
- Tối đa 50 Invoice và 18 MB tổng PDF mỗi email, để chừa phần mã hóa cho giới hạn thư thường gặp. Nhà cung cấp có thể áp dụng giới hạn thấp hơn.

## Cấu hình trên Vibe Host

Địa chỉ gửi được owner chốt: **info@digicomjsc.com**. Website vẫn chạy khi chưa cấu hình SMTP; nút gửi thật bị khóa và có thông báo.

Quản trị viên điền các biến môi trường riêng trên host, rồi triển khai lại:

| Biến | Giá trị |
| --- | --- |
| DGC_MAIL_FROM | info@digicomjsc.com |
| DGC_SMTP_HOST | Tên máy chủ SMTP do nhà cung cấp email cấp |
| DGC_SMTP_PORT | 587 (STARTTLS bắt buộc) hoặc 465 (TLS trực tiếp) |
| DGC_SMTP_USER | Tên đăng nhập SMTP, thường là info@digicomjsc.com |
| DGC_SMTP_PASSWORD | Mật khẩu SMTP / mật khẩu ứng dụng do nhà cung cấp cấp |

Không gửi mật khẩu trong chat hoặc đưa vào Git. Không tắt xác minh chứng chỉ/TLS. Nếu nhà cung cấp chỉ cho OAuth, cấu hình hiện tại chưa hỗ trợ; cần bổ sung phương án xác thực phù hợp trước khi bật gửi. SPF/DKIM/DMARC và quyền gửi của địa chỉ này cần được nhà cung cấp email thiết lập theo hướng dẫn của họ. Chưa có kiểm chứng cấu hình gửi thật trên host.

Tài liệu vận chuyển: [SMTP Nodemailer](https://nodemailer.com/smtp), [đính kèm](https://nodemailer.com/message/attachments). Mọi tệp được đưa vào email bằng bytes đã kiểm tra checksum từ kho của công ty; không nhận đường dẫn/URL đính kèm từ trình duyệt.

## Chống gửi lặp và lịch sử

Mỗi lần gửi có mã yêu cầu và một Message-ID cố định. Server kiểm lại chứng từ, nội dung và người nhận trước khi nhận gửi; mã đã nhận không gửi lại. Nội dung/chứng từ/người nhận giống hệt trong năm phút bị chặn, kể cả mở tab mới. Giới hạn năm lần tiếp nhận/phút/công ty. Lịch sử lưu người thực hiện, thời gian, To/Cc, nội dung, trạng thái Invoice, tài liệu/checksum và kết quả nhà cung cấp; không lưu mật khẩu SMTP.

Khi kết nối lỗi, kết quả là **chưa rõ**, không tự thử lại. Nếu tiến trình ngắt sau khi máy chủ thư tiếp nhận nhưng trước khi ghi kết quả, lịch sử chỉ còn yêu cầu tiếp nhận; quản trị viên cần tra theo Message-ID/mã yêu cầu ở log nhà cung cấp. Đây không phải cam kết gửi đúng một lần tại hộp thư người nhận và không có cơ chế theo dõi đã đọc.
