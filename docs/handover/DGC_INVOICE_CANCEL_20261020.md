# Hủy Invoice chưa thanh toán — 20/10/2026

Đã thêm API/UI hủy Invoice DGC hiện hành chưa thanh toán. Đây là chức năng runtime cho chứng từ mới; chưa áp dụng vào snapshot thật, chưa hủy/nhập Invoice thật. SOA cutoff và ba ánh xạ liên kết tài chính vẫn chờ owner.

## Căn cứ và hành vi

Đọc donor v61 `40_Invoice_Core.js:1197–1285`, `cancelInvoice`: Manager/BOD; Draft/Issued/Overdue chưa thanh toán; chặn payment/transaction, AR đã thu, SOA detail hoặc approval package; xóa các dòng liên quan và trash PDF. Cách thích nghi ở ERP:

- Quyền INVOICE_CANCEL, tenant DGC, Origin/CSRF. Kiểm tra trước và xác nhận riêng với digest nguồn/công nợ/file hiện tại, lý do tối thiểu 10 ký tự.
- Chỉ Invoice isCurrent, DRAFT hoặc ISSUED chưa thu; nhận OVERDUE nếu có trạng thái này. Schema hiện lưu ISSUED cho trường hợp quá hạn; ngày dueDate đã qua không ngăn hủy Invoice chưa thu. Không đổi schema status để thử một trạng thái DB không hỗ trợ.
- Paid, Partially Paid, Superseded, bản không current hoặc có bất kỳ payment row đều bị chặn; không tin riêng số Paid trên header. AR phải đúng một bản ghi của Invoice đã phát hành, chưa thu, số ban đầu/còn lại khớp payable. Draft không được có issuedAt/AR.
- Phạm vi/items/current revenue và snapshot sourceRevenueIds phải khớp; không giải phóng nguồn còn được Invoice khác sử dụng. Kiểm PDF hiện hành và checksum trước khi xác nhận.
- Hủy atomic: Invoice CANCELLED/isCurrent=false, scope/items không current, Document PDF/workbook CANCELLED, AR CANCELLED và revenue tổng trở về INVOICE_READY. Không sửa số tiền, không đụng InputRecon/AP và không ghi cash.
- Giữ nguyên AR original/paid/outstanding để bảo toàn đẳng thức và lịch sử. AR cũ ngừng xuất hiện trong sổ hiện hành vì Invoice không current; không đặt outstanding về 0 như một khoản đã thu/xóa nợ. PDF/workbook bytes được giữ nhưng endpoint tải Invoice đã hủy trả 404.
- Lập lại từ nguồn sau hủy tạo số/phiên bản mới, giữ Invoice/AR cũ. Đã kiểm tạo và phát hành bản mới có đúng một AR hiện hành. Chưa mở tái tạo trực tiếp Invoice đã phát hành; thực hiện hủy rồi tạo lại. Credit note/điều chỉnh Invoice đã thu chưa có.

Giữ lịch sử thay cho xóa vật lý/trash donor, phù hợp yêu cầu provenance/migration. Không gọi donor hoặc sửa Google Drive. GST vẫn dùng luồng hiện có; giao diện chỉ hiện nút hủy unpaid khi references API xác nhận tenant DGC.

## Tham chiếu SOA/hồ sơ phê duyệt

Migration additive `20261020002000_dgc_invoice_document_links` thêm liên kết Invoice–Document cho SOA/APPROVAL_PACKAGE, FK ghép company với cả hai phía, unique và kind check. Generic ApprovalRequest trỏ Invoice cũng chặn hủy/xóa draft.

`linkInvoiceDocuments` dành cho creator/importer SOA/package tương lai, đăng ký toàn bộ tập Invoice trong cùng transaction. Khóa tất cả kỳ theo thứ tự trước company và các Invoice theo ID, kiểm lại current/status, document cùng tenant/đúng loại/ACTIVE, rồi upsert. Không gọi helper từng Invoice nếu một tài liệu có nhiều kỳ; cần khóa cả tập để tránh đảo thứ tự khóa. Cancellation/payment/issue dùng khóa tương thích.

Đã kiểm bằng tài liệu fixture. SOA/package runtime/importer **chưa được triển khai**, nên việc có bảng/guard này không chứng minh parity SOA/package hoặc đã nạp tham chiếu donor. Importer tương lai phải đăng ký các quan hệ trước khi mở thao tác hủy trên bản ghi nhập. Không có endpoint công khai tự gán tham chiếu.

## API và UI

- POST `/api/v1/invoices/:id/cancel-preview`: điều kiện, digest, số Invoice/tiền tệ/tác động AR.
- POST `/api/v1/invoices/:id/cancel`: digest, reason, confirmed=true; khóa kỳ/company/Invoice và kiểm lại toàn bộ.
- Nút “Kiểm tra hủy Invoice” trên Invoice DGC đã phát hành chưa thu; panel mô tả tác động, lý do, checkbox và xác nhận. Danh sách vẫn 10 dòng/trang, hiển thị partner key.
- `/invoices/:id/delete` vẫn chỉ xóa draft và đã được bổ sung guard tham chiếu/payment cho DGC, tránh bypass qua endpoint cũ.

## Kiểm chứng

- Prisma generate và workspace build Node 22/pnpm 10 đạt. Tất cả **21 migrations** deploy thành công từ DB fixture trống; không áp dụng migration mới vào staging chứa snapshot thật.
- Bộ DGC Invoice tích hợp **131 assertions** đạt trên mã cuối: preview/auth/quyền/CSRF, paid/status/AR sai, PDF tamper, stale digest, SOA/package/FK tenant và bộ tham chiếu nhiều kỳ, approval trên draft, payment row/header không khớp, audit failure rollback, hai yêu cầu hủy đồng thời, giữ bytes và AR amounts, nguồn mở lại và bản Invoice/AR mới, USD và VND quá hạn.
- Bộ hồi quy **264** checks recon–Invoice–AR/payment đạt trên schema 21, cùng 85 characterization checks. Fixture GST độc lập trong DB test; không truy cập dịch vụ/data GST.
- Đã thao tác browser localhost: Invoice USD 90 → kiểm điều kiện → nhập lý do/xác nhận → hủy → danh sách Invoice và phải thu hiện hành trống → doanh thu “Đã chốt · Chờ Invoice”. Đã đăng xuất/đóng tab. Proof private: `artifacts/dgc-migration/20261020/proofs/invoice-cancel/browser-cancelled.png`, `browser-ar-after-cancel.png`; chỉ chứa dữ liệu tổng hợp.

Chưa nghiệm thu với người dùng thật/Staff/Manager/BOD, chưa triển khai. Lịch sử Invoice import, ba ánh xạ và SOA cutoff tiếp tục theo tài liệu bàn giao riêng.

Đã có [bản sửa bộ lọc quá hạn](DGC_INVOICE_OVERDUE_20261020.md) sau phát hiện stored status ISSUED: 149 assertions DGC trên mã cuối, giữ nguyên ngày/số tiền và không quyết định SOA cutoff.
