# Làm lại kỳ 10/2026 theo yêu cầu owner

Ngày 05/11 owner muốn tự nhập lại đối soát và tạo Invoice tháng 10 để thử ERP sau cắt chuyển. Owner chọn rõ: **làm lại trên sổ thật; lưu hồ sơ cũ vào lịch sử trước**. Không dùng bản sao để owner vận hành, không tự chọn/xóa các phương án Invoice trùng hoặc sửa tiền nguồn.

Đã bổ sung thao tác một lần tại `/operations/restart-october`, API `/api/v1/october-restart`. Chỉ ADMIN DGC với SYSTEM_CONFIG_EDIT/INVOICE_CANCEL/RECON_CANCEL, đúng DB `dgc_erp_db`, được preview/apply. Các importer master/evidence/book, bootstrap/seed và cash giữ tắt. Cổng localhost riêng chỉ dành cho test.

Phạm vi được đóng cố định vào tháng 10: đúng 8 doanh thu captured, 8 Invoice captured còn Draft và 5 đối soát nguồn. Chặn nếu có Invoice đã phát hành, thu/AR, Input Recon/AP, tham chiếu Invoice, công việc đối soát mới hoặc liên kết ngoài phạm vi. Preview ghim toàn graph, file checksum và actor; apply khóa kỳ/công ty, đọc/kiểm lại rồi ghi cùng transaction Serializable.

Bản lưu giữ nguyên graph ban đầu, tiền, ngày, trạng thái trước khi lưu, nguồn raw và các PDF. Có 18 PDF trong bản lưu: 8 Invoice, 5 Recon gốc, 5 gói/bản ký tham chiếu đúng hàng nguồn. Không sửa blob, xóa hàng hoặc tạo dòng tiền. Native Invoice/scope chuyển CANCELLED/non-current, Revenue/Reconciliation chuyển SUPERSEDED/non-current; các row raw/provenance không sửa. Các kỳ khác, AR/khoản thu và ba Input Recon lịch sử giữ nguyên.

Bản lưu xem từ link **Hồ sơ tháng 10/2026 trước khi nhập lại** trong Invoice lịch sử; bảng phân trang 10 dòng, PDF tra cứu qua whitelist của bản lưu và kiểm checksum. Người chỉ có quyền Invoice không được đọc PDF Recon hoặc dữ liệu doanh thu. Bấm lại chỉ trả biên nhận cũ, không ẩn công việc mới; không cho preview mở lại lần thứ hai.

Windows/Node 22 trên clone riêng có đủ 27 migrations: **545 checks đạt**, gồm quyền/CSRF/tenant/DB/actor digest, chặn đã phát hành/AR, thiếu file, lỗi DB giữa chừng hoàn tác toàn bộ, replay, đọc đủ 18 PDF lịch sử, 451 file nguyên bytes, các kỳ khác/AR/receipts/Input Recon không đổi và upload lại PDF nguồn thành công sau khi lưu lịch sử. Chỉ bản sao có dữ liệu upload thử/Invoice giả lập mới; không promote nó lên host. API TypeScript và web TypeScript/Vite build đạt. Linux/triển khai/backup và apply host cần ghi nhận khi thực sự hoàn tất; tại mốc viết phần này sổ thật chưa đổi.

Sau apply, tổng hàng tài chính vẫn được bảo toàn nhưng số hiện hành giảm theo phạm vi đã lưu: 409 doanh thu hiện hành; 58 Invoice chưa hủy còn trong danh sách (53 đã phát hành/đã thu và 5 nháp kỳ trước). Không gọi biên nhận nhập 417/66 ban đầu là số hiện hành sau owner mở lại kỳ. 37 source archives cũ giữ riêng; 8 hồ sơ October mới lưu có trang lịch sử kỳ riêng. Owner tự nhập lại, không tự phát hành hoặc ký chứng từ thay owner.
