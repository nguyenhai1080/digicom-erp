# Quyền đọc lịch sử thu Invoice DGC — 20/10/2026

Donor `01_AppShell.js:276`, `getEntityData`, có `invoicePayments` với các cột Payment_ID, Invoice_Number, Partner_ID, Payment_Date, Paid_Amount_USD, Swift_No, Payment_Method, Note; phần role gate chỉ giới hạn reports/users/audit/config, không giới hạn bảng này cho Manager/BOD. Target vẫn yêu cầu đăng nhập; không kế thừa reader yếu của donor.

## Phạm vi

- DGC GET `/invoices/:id/payments` dùng INVOICE_PAYMENT_VIEW, độc lập PAYMENT_VIEW. Mẫu Staff/Manager/BOD thêm quyền đọc này; không tự tạo/gán role hoặc thay quyền tài khoản thật. Baseline ADMIN bổ sung permission, chưa chạy seed trên staging thật.
- DGC chỉ có PAYMENT_VIEW không fallback sang quyền đọc Invoice mới. GST giữ PAYMENT_VIEW cho cùng endpoint và giữ response danh sách tài khoản cũ.
- API trả canPost theo đủ ba quyền PAYMENT_CREATE/APPROVE/POST. Reader DGC không đủ bộ quyền ghi nhận nhận accounts rỗng; không truy vấn danh mục tài khoản/quỹ. Dữ liệu lịch sử vẫn giữ tiền tệ, tiền phân bổ, ngày, ghi chú và nguồn; không sửa financial state.
- Target giữ các trường số tiền gốc/phân bổ USD/VND và nguồn của lịch sử đang có, rộng hơn tập cột Paid_Amount_USD của generic reader donor. Đây chưa phải nghiệm thu parity từng field; không có quyền xem báo cáo/số dư quỹ chỉ từ quyền đọc receipt.
- Invoice references trả canViewPaymentHistory; UI dựa vào flag này để mở Lịch sử thanh toán cho Staff. UI form ghi nhận và bổ sung tài khoản vẫn yêu cầu quyền ghi; phân trang lịch sử giữ 10 dòng, trước/sau, tổng/trang.
- Download chứng từ ngân hàng vẫn dùng PAYMENT_VIEW; chưa có bằng chứng donor cho việc mở toàn bộ file cho Staff. UI Staff chỉ báo Có chứng từ; không mở link không có quyền. Đây là giới hạn hiện tại, không tuyên bố parity toàn bộ chứng từ.
- Cash accounts, balances, entries, các reports và payment writers giữ quyền cũ. Không cấp PAYMENT_VIEW cho Staff để xử lý nhu cầu đọc lịch sử.

`requirePermission` hỗ trợ callback chọn permission sau xác thực. `writeGuard` dùng cùng helper, sau đó kiểm Origin/CSRF như trước; mọi guard static giữ tên quyền hiện hành.

## Kiểm chứng

Suite role/manual/FX bổ sung fixture đọc: hai công ty, mỗi Invoice có 14 receipt lịch sử và AR; tài khoản VND giả lập riêng không liên kết receipt. Kiểm Staff đọc được nhưng không nhận danh mục tài khoản, không mở cash endpoints hoặc writers/document; Manager writer có tài khoản; GST reader cũ giữ hành vi; 401/403/404 theo quyền/tenant; thu hồi quyền; toàn bộ Invoice/AR/receipts/balance/audit không đổi sau đọc. Các fixture này không phải importer hoặc kiểm chứng lại source PDF.

Build workspace Node 22/pnpm 10 đạt; suite role/manual/FX/receipt **186 assertions đạt** trên schema 21, DB disposable riêng, direct PostgreSQL container namespace và connection_limit=5. Chưa kiểm browser tương tác nút lịch sử Staff trong đợt này. Build/API không thay nghiệm thu UI hoặc full donor parity.

Hồi quy cùng code: DGC Invoice **149**, tài chính nền **264**, characterization tài chính **85** đạt. Invoice suite dùng baseline seed 103 quyền trên fixture; không nhập bản ghi thật.

Auth/session/CSRF/tenant/bootstrap **52** checks đạt trên DB `erp_auth_acceptance_receipt_seeded_20261020` có baseline quyền được seed trước suite. Lượt thử thiếu PROJECT_VIEW/PROJECT_VIEW_ALL ban đầu bị dừng ở setup và không được tính là pass; không thay test hoặc bỏ kiểm tra để xử lý lỗi chuẩn bị fixture.

Trước triển khai cần provision INVOICE_PAYMENT_VIEW tường minh cho các role DGC hiện có; không dùng fallback từ quyền quỹ. Baseline seed hiện 103 permission nhưng chỉ đã chạy trên fixture.

Không đổi migration schema, snapshot, financial proposals, source Sheets, lịch sử đã nhập, SOA cutoff, timezone hoặc cash ledger thật. Không deploy/push.
