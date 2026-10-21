# Bắt đầu làm việc với DGC Finance

Cập nhật ngày 21/10/2026, giờ Việt Nam.

## Trạng thái sau tiếp nhận 19–21/10

[Tra cứu Invoice lịch sử trong ứng dụng](docs/handover/DGC_INVOICE_HISTORY_RUNTIME_20261021.md): API/UI chỉ đọc từ kho ghim hash và UUID công ty; 63 kiểm tra API đạt. [Đã kiểm UI](docs/handover/DGC_INVOICE_HISTORY_UI_20261021.md) tìm số trùng, phân trang, chi tiết, retry và tải PDF khớp byte; sửa tìm lại cùng query không reload. PDF inline vẫn chưa nghiệm thu. Chưa cấu hình kho thật cho người dùng hoặc nhập DB.

[Gói Invoice lịch sử](docs/handover/DGC_INVOICE_ARCHIVE_20261020.md): đã tách 33 bản Superseded/Cancelled cùng PDF gốc vào kho evidence private, giữ số âm/liên kết thiếu và nhận dạng theo hàng nguồn; verify/replay/tra cứu 10 dòng đạt. Reader filesystem đã bổ sung ngày 21/10, chưa nhập DB.

[Đối chiếu ngày chốt SOA](docs/handover/DGC_SOA_CUTOFF_REVIEW_20261020.md): đã có màn/API chỉ đọc so sánh hai chính sách khoản thu, tổng USD/VND riêng, 10 dòng/trang; 56 kiểm tra SOA và 223 hồi quy quyền đạt, đã kiểm browser. Chưa chọn cutoff hoặc phát hành SOA.

[Kiểm tra UI kế toán](docs/handover/DGC_ACCOUNTING_UI_20261020.md): đã chạy browser lưu tỷ giá tại màn đối soát → tự tải nguồn → tạo nháp đầu vào; sửa mở form từ kỳ thiếu và bỏ xác nhận khi chỉnh dữ liệu. Kiểm phân trang 10 dòng, audit đúng kế toán, AP/cash vẫn 0 trong DB giả lập.

[Kế toán nhập tỷ giá và chuẩn bị đối soát](docs/handover/DGC_ACCOUNTING_PREPARATION_20261020.md): theo chỉ đạo mới, có mẫu DGC_ACCOUNTANT và phần tỷ giá tại cả hai màn hình đối soát; chuẩn bị nháp được, không mở duyệt cuối/cấu hình ký/quỹ. Build, 223 kiểm tra quyền và 105 đối soát DGC đạt; chưa gán tài khoản thật.

[Đọc lịch sử thu Invoice](docs/handover/DGC_RECEIPT_READ_20261020.md): đã tách INVOICE_PAYMENT_VIEW cho Staff/Manager/BOD; reader Staff không mở cash accounts/balances, payment writer hoặc tải chứng từ ngân hàng. Mẫu quyền chưa gán cho tài khoản thật.

[Quyền tỷ giá DGC](docs/handover/DGC_FX_ACCESS_20261020.md): Manager/BOD có quyền tạo tỷ giá riêng, UI truy cập ngoài cấu hình ký, phân trang 10; 149 kiểm tra role/manual/FX, 187 InputRecon/AP và 264 hồi quy đạt. Chưa mở sửa tỷ giá đã có hoặc cấp quyền tài khoản thật.

[Quyền doanh thu và mẫu vai trò DGC](docs/handover/DGC_ROLE_ACCESS_20261020.md): đã tách năm quyền nhập tay khỏi OCR, thêm Gửi kiểm tra và mẫu Staff/Manager/BOD có dẫn nguồn. Mẫu chỉ điền biểu mẫu, chưa tự tạo/gán cho người dùng thật; full role parity và kiểm UI mới vẫn chưa nghiệm thu.

[Bộ lọc Invoice quá hạn](docs/handover/DGC_INVOICE_OVERDUE_20261020.md) đã sửa theo ngày chốt explicit, giữ nguyên stored status/số tiền; 149 assertions DGC và 264 hồi quy đạt. Tương tác browser của bộ lọc mới chưa kiểm trọn do phiên bị gián đoạn; SOA cutoff vẫn chờ owner.

[Luồng hủy Invoice chưa thanh toán](docs/handover/DGC_INVOICE_CANCEL_20261020.md) đã có API/UI và kiểm thử DB/browser fixture: giữ lịch sử/file/AR amounts, ngừng công nợ hiện hành, mở nguồn lập lại; không cash posting. SOA/package mới có guard tham chiếu để tích hợp tiếp, chưa phải runtime SOA hoàn chỉnh.

[Chuẩn bị lịch sử Invoice và PDF gốc](docs/handover/DGC_INVOICE_HISTORY_20261020.md): gói 91 Invoice (53 hiện hành, 5 nháp, 33 lịch sử), 5 bản cần đối chiếu cấu trúc. Đã sao lưu/kiểm bytes 91 PDF riêng; ba ánh xạ liên kết tài chính đang chờ owner, chưa áp dụng. Chưa nhập financial records.

Đã chạy [rà soát liên kết migration](docs/handover/DGC_REFERENCE_REVIEW_20261020.md): 3.154 hàng/10.894 liên kết, giữ 7 nhóm trùng ID; còn 63 liên kết cần đối chiếu. Đây là báo cáo đọc snapshot, chưa cho phép nhập tài chính.

[Đối chiếu số tiền lịch sử](docs/handover/DGC_FINANCE_REVIEW_20261020.md): payment/balance của 91 Invoice và 53 AR hiện hành khớp; đã ghi riêng sai khác làm tròn, nguồn chưa rõ và một dòng âm thuộc Invoice Superseded. Chưa sửa hoặc nhập chứng từ thật.

Đã có [InputRecon/AP và kiểm thử UI mới nhất](docs/handover/DGC_INPUT_RECON_AP_20261020.md): tính theo hợp đồng Input, generate Draft, PDF biên bản và approve tạo AP, giữ provenance và không phát sinh cash posting. SOA đang chờ xác nhận cách tính khoản thu theo ngày chốt; migration tài chính/toàn chuỗi chưa hoàn tất.

Đợt tiếp tục đã lấy snapshot 25 bảng/3.154 hàng vào staging riêng, nhập thử 10 dịch vụ, 4 đối tác (Movitel Active), 9 hợp đồng và 14 liên kết dịch vụ theo xác nhận owner, triển khai adapter Invoice DGC, ảnh ghép ký đối soát theo xác nhận owner và kiểm thử DB/PDF Linux. Đọc [kết quả migration và Invoice mới nhất](docs/handover/DGC_MIGRATION_AND_INVOICE_20261019.md) trước các nhận định lịch sử bên dưới. Chưa nhập financial record thật; thuế/alias hợp đồng đã được xử lý và kiểm tra replay/restore, InputRecon/AP/SOA và migration toàn chuỗi chưa hoàn tất.

Code đã được đưa vào repository Git riêng tại thư mục này, branch `dgc/main`, kế thừa `f97eb627`; chưa cấu hình remote hoặc triển khai. Đọc [tiến độ và khoảng trống hiện tại](docs/handover/PROGRESS_20261019.md) cùng [kế hoạch môi trường/chuyển dữ liệu](docs/handover/DGC_ENVIRONMENT_MIGRATION_PLAN.md). Phần dưới là yêu cầu bàn giao ban đầu; nhận định thư mục trống/chưa có Git không còn là trạng thái hiện tại. Ưu tiên tiếp theo là Invoice DGC, mapping quyền/tài sản ký, rồi InputRecon/AP/SOA trước staging.

Đọc [tài liệu bàn giao](docs/handover/HANDOVER.md) trước khi sửa code, nhập dữ liệu hoặc triển khai. Project Codex DGC-ERP hiện trỏ tới `D:/Projects/DGC-ERP`; thư mục này còn trống trước khi lưu tài liệu và chưa có Git ứng dụng.

Mục tiêu là đưa DGC Finance lên Vibehost ở tài khoản cũ, tên miền `erp.digicomjsc.com`, dùng code phát triển từ ERP Core và chuyển dữ liệu từ `DGC_ERP_2026_PROD_RC1_CLONE`. GST đã chuyển sang tài khoản mới; không sửa code hoặc dữ liệu sản xuất GST để làm DGC.

## Yêu cầu đầu tiên cho phiên Codex tiếp theo

> Đọc START_HERE.md và docs/handover/HANDOVER.md. Phân biệt code ERP Core dự kiến dùng cho DGC với Apps Script hiện hành. Kiểm tra nhánh feature/dgc-finance tại D:/Projects/DGC-FINANCE-WEB, so sánh với nền GST ổn định và đọc baseline nghiệp vụ DGC. Chuẩn bị code và repository DGC riêng trong project này; trước khi triển khai phải có kế hoạch môi trường DGC độc lập và rà soát tính năng còn thiếu. Chuyển dữ liệu phải thử trên staging, giữ nguồn gốc và đối soát trước khi đưa vào sử dụng.

Các việc tạo repository, giải phóng host cũ, triển khai DGC và nhập dữ liệu chưa hoàn tất. Tài liệu bàn giao không thay thế bước kiểm tra này. Không đưa `.env`, token, bản sao dữ liệu thật hoặc kho PDF lên Git.
