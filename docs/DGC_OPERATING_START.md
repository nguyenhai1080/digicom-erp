# Bắt đầu vận hành DGC ERP

Website: https://erp.digicomjsc.com/. Sổ đã chuyển theo nguồn chụp ngày 04/11/2026; không nhập lại các Invoice, doanh thu hoặc khoản thu đã có. Khi bắt đầu dùng ERP, dùng hệ thống cũ để tra cứu và dừng nhập song song. Phát sinh ngoài lượt chụp nguồn cần được xác định riêng trước khi nhập để tránh trùng.

## Phân công công việc

Các mẫu có sẵn tại **Quản lý Người dùng → Thêm vai trò → Mẫu quyền DGC**. Chọn mẫu chỉ điền biểu mẫu, không tự cấp quyền cho người dùng. Chỉ quản trị viên thực hiện tạo vai trò và gán người dùng sau khi owner xác định danh sách.

| Công việc | Nhân viên | Kế toán | Quản lý | Ban giám đốc |
| --- | --- | --- | --- | --- |
| Xem dịch vụ, đối tác, hợp đồng, doanh thu, Invoice và lịch sử thu | Có | Có | Có | Có |
| Tạo/sửa doanh thu nháp, gửi duyệt | Có | Có | Có | Có |
| Upload PDF đối soát đầu ra | Có | Có | Có | Có |
| Nhập tỷ giá kỳ; kiểm tra/sửa nháp đối soát đầu ra | — | Có | Có | Có |
| Chuẩn bị đối soát đầu vào | — | Có | Có | Có |
| Duyệt doanh thu/đối soát đầu ra, tạo/phát hành/hủy Invoice theo điều kiện | — | — | Có | Có |
| Ghi khoản thu giảm công nợ | — | — | Có | Có |
| Duyệt đối soát đầu vào để tạo phải trả | — | — | — | Có |
| Chỉnh vị trí dấu trên bản đã duyệt; cấu hình ký | — | — | — | Có |
| Quản trị người dùng/vai trò | — | — | — | Có |

Các mẫu này áp dụng phần Finance đã triển khai. Quyền thực tế là tổng các vai trò được gán; không gán thêm vai trò Quản lý/ADMIN cho kế toán chỉ để nhập tỷ giá. Tài khoản quản trị hiện hữu không cần thay vai trò để vận hành.

## Luồng làm việc

1. **Đối soát đầu ra:** kế toán upload PDF, kiểm tra dịch vụ/kỳ/hợp đồng và số liệu nháp. Tỷ giá theo tháng có thể nhập ngay trong phần tỷ giá của màn đối soát. Quản lý hoặc Ban giám đốc duyệt cuối. Dữ liệu đã nhập từ lịch sử không cần upload hoặc duyệt lại.
2. **Doanh thu và Invoice:** xem doanh thu chờ Invoice, chọn kỳ và cách lập Invoice phù hợp, kiểm tra nháp rồi phát hành. Sổ chuyển giữ 13 Invoice nháp, gồm các phương án sử dụng cùng nguồn: chỉ phát hành phương án được chọn. Hệ thống chặn phát hành trùng nguồn. Không phát hành nháp chỉ để kiểm thử.
3. **Thu công nợ:** mở **Quản lý Invoice → Thanh toán / lịch sử**, dùng chế độ ghi thu vào công nợ khi quỹ/ngân hàng chưa áp dụng. Nhập ngày thực nhận và các số USD/VND thực tế theo chứng từ; không suy tiền thực nhận từ tỷ giá báo cáo. Khoản thu mới giảm phải thu, không cộng số dư tài khoản tiền trong giai đoạn này. Khoản thu cũ đã chuyển không nhập lần nữa.
4. **Đối soát đầu vào/phải trả:** kế toán chuẩn bị nháp và PDF, Ban giám đốc kiểm tra rồi duyệt để tạo phải trả. Ba hồ sơ Generated từ nguồn vẫn chưa duyệt; không tự tạo thêm phải trả chỉ vì đã chuyển sổ. Thanh toán từ quỹ/ngân hàng để sau.
5. **Báo cáo:** dùng USD/VND và múi giờ Việt Nam. “Thiếu tỷ giá” nghĩa là chưa có tỷ giá báo cáo cho kỳ; kế toán nhập kỳ còn thiếu, không đổi tiền USD lịch sử. SOA chỉ trừ khoản thu đến hết ngày chốt, không trừ khoản thu tương lai.

## Tra cứu và bảo toàn lịch sử

**Invoice lịch sử** chứa 37 bản hủy/thay thế, không cộng vào phải thu hiện hành. PDF gốc và cảnh báo sai lệch nguồn được giữ lại; không sửa lịch sử để làm mất cảnh báo. Các bảng hiển thị 10 dòng/trang.

Quỹ, ngân hàng và số dư tiền chưa áp dụng. Không cần tạo tài khoản tiền hoặc số dư đầu kỳ để tiếp tục các luồng trên. Các đường nhập lịch sử/master/evidence và bootstrap/seed đã tắt; không bật lại để bổ sung nghiệp vụ mới.

Sau chuyển đã có backup PostgreSQL và website/kho chứng từ trên host. Kết quả kỹ thuật và giới hạn nghiệm thu được ghi tại [bàn giao chuyển sổ](handover/DGC_HOST_BOOK_IMPORT_20261105.md). Việc kiểm thử trên dữ liệu giả lập không thay cho nghiệm thu của người dùng thực tế.

