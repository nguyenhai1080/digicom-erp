# Bộ lọc Invoice quá hạn theo ngày chốt — 20/10/2026

Đã sửa bộ lọc quá hạn DGC trong API và giao diện. Trước đó GET Invoice lọc trực tiếp status=OVERDUE, trong khi DB chỉ lưu ISSUED cho Invoice chưa thu, kể cả đã qua dueDate; vì vậy bộ lọc không trả các bản ghi cần xem.

## Căn cứ và cách tính

Đọc donor `40_Invoice_Core.js:DGC_isInvoiceOverdue_` và `DGC_calculateInvoiceStatus_`: ngày đến hạn phải nhỏ hơn ngày xem mới quá hạn; Paid/Partially Paid/Draft có thứ tự xử lý riêng. Donor lấy ngày hiện tại theo môi trường Apps Script. DGC-ERP chưa được owner xác nhận reporting timezone nên bản sửa nhận **asOf dạng ngày lịch rõ ràng**, không mặc định lấy ngày server/company.

- GET `/api/v1/invoices?status=OVERDUE&asOf=YYYY-MM-DD` cho DGC yêu cầu asOf hợp lệ. Thiếu hoặc ngày không tồn tại trả 400.
- Lọc Invoice hiện hành status ISSUED, chưa thu, payable dương và dueDate < asOf. Ngay trong ngày đến hạn chưa bị tính quá hạn. Không đưa Paid, Partial, Draft, Superseded/Cancelled vào tập quá hạn.
- `status` trả về vẫn là trạng thái lưu trong DB. Khi có asOf, API thêm `displayStatus=OVERDUE` cho dòng đạt điều kiện; không ghi đổi status hoặc sửa số tiền/payment/AR.
- Các bộ lọc kỳ/partner/publication và phân trang/count cùng áp dụng một predicate. Mặc định 10 dòng; API vẫn cho limit theo giới hạn sẵn có.
- “Đã phát hành” tiếp tục là bộ lọc trạng thái lưu, gồm cả Invoice chưa thu đã qua hạn. Bộ lọc “Quá hạn” là tập hẹp theo ngày chốt.
- Tham số asOf này chỉ là ngày xem tình trạng dueDate, **không phải SOA cutoff và không tính lại số đã thu theo lịch sử**. Quyết định SOA vẫn chờ owner.
- Luồng query cũ của GST không đổi; capability canReviewOverdue chỉ bật cho tenant DGC.

## Giao diện và kiểm chứng

Giao diện DGC có input “Ngày chốt quá hạn” để trống ban đầu, dòng nhắc chọn ngày, option Quá hạn chưa bật khi thiếu ngày. Xóa ngày khi đang lọc quá hạn sẽ đưa trạng thái về Tất cả. Bảng dùng displayStatus khi có, thêm ngày đến hạn, giữ partner key và 10 dòng/trang.

- Workspace build Node 22/pnpm 10 đạt.
- Bộ DGC Invoice **149 assertions** đạt, gồm thiếu/ngày sai, đúng ngày đến hạn/ngày kế tiếp, displayStatus không đổi stored status, phân trang tổng 2 Invoice USD/VND qua hai trang, lọc kỳ/partner/publication và không cash posting; toàn bộ hủy/regeneration tests vẫn đạt.
- Bộ hồi quy **264** checks recon–Invoice–AR/payment và 85 characterization checks đạt lại trên mã có bản sửa.
- Browser đã đăng nhập fixture và quan sát được input ngày, option Quá hạn bị disable và dueDate trên bảng. Phiên browser bị gián đoạn trước khi kiểm trọn thay ngày/lọc; chưa xác nhận tương tác UI đầu cuối. Các tab lỗi nội bộ sau đó không được browser policy cho phép quan sát, đã dừng thử đường đó. Không dùng kết quả API/build thay cho nghiệm thu UI.
- Server fixture đã dừng, không deploy/push hoặc sửa dữ liệu thật. Không có migration DB mới cho bản sửa này.

Tiếp tục: hoàn tất kiểm tra tương tác ngày chốt trên browser khi phiên ổn định; SOA, financial link decisions/importer và mapping role vẫn theo các hạng mục đang chờ/chưa hoàn tất trong START_HERE.
