# Làm lại kỳ 10/2026 theo yêu cầu owner

Ngày 05/11 owner muốn tự nhập lại đối soát và tạo Invoice tháng 10 để thử ERP sau cắt chuyển. Owner chọn rõ: **làm lại trên sổ thật; lưu hồ sơ cũ vào lịch sử trước**. Không dùng bản sao để owner vận hành, không tự chọn/xóa các phương án Invoice trùng hoặc sửa tiền nguồn.

Đã bổ sung thao tác một lần tại `/operations/restart-october`, API `/api/v1/october-restart`. Chỉ ADMIN DGC với SYSTEM_CONFIG_EDIT/INVOICE_CANCEL/RECON_CANCEL, đúng DB `dgc_erp_db`, được preview/apply. Các importer master/evidence/book, bootstrap/seed và cash giữ tắt. Cổng localhost riêng chỉ dành cho test.

Phạm vi được đóng cố định vào tháng 10: đúng 8 doanh thu captured, 8 Invoice captured còn Draft và 5 đối soát nguồn. Chặn nếu có Invoice đã phát hành, thu/AR, Input Recon/AP, tham chiếu Invoice, công việc đối soát mới hoặc liên kết ngoài phạm vi. Preview ghim toàn graph, file checksum và actor; apply khóa kỳ/công ty, đọc/kiểm lại rồi ghi cùng transaction Serializable.

Bản lưu giữ nguyên graph ban đầu, tiền, ngày, trạng thái trước khi lưu, nguồn raw và các PDF. Có 18 PDF trong bản lưu: 8 Invoice, 5 Recon gốc, 5 gói/bản ký tham chiếu đúng hàng nguồn. Không sửa blob, xóa hàng hoặc tạo dòng tiền. Native Invoice/scope chuyển CANCELLED/non-current, Revenue/Reconciliation chuyển SUPERSEDED/non-current; các row raw/provenance không sửa. Các kỳ khác, AR/khoản thu và ba Input Recon lịch sử giữ nguyên.

Bản lưu xem từ link **Hồ sơ tháng 10/2026 trước khi nhập lại** trong Invoice lịch sử; bảng phân trang 10 dòng, PDF tra cứu qua whitelist của bản lưu và kiểm checksum. Người chỉ có quyền Invoice không được đọc PDF Recon hoặc dữ liệu doanh thu. Bấm lại chỉ trả biên nhận cũ, không ẩn công việc mới; không cho preview mở lại lần thứ hai.

Windows/Node 22 trên clone riêng có đủ 27 migrations: **545 checks đạt**, gồm quyền/CSRF/tenant/DB/actor digest, chặn đã phát hành/AR, thiếu file, lỗi DB giữa chừng hoàn tác toàn bộ, replay, đọc đủ 18 PDF lịch sử, 451 file nguyên bytes, các kỳ khác/AR/receipts/Input Recon không đổi và upload lại PDF nguồn thành công sau khi lưu lịch sử. Chỉ bản sao có dữ liệu upload thử/Invoice giả lập mới; không promote nó lên host. API TypeScript và web TypeScript/Vite build đạt. Linux/triển khai/backup và apply host cần ghi nhận khi thực sự hoàn tất; tại mốc viết phần này sổ thật chưa đổi.

Sau apply, tổng hàng tài chính được bảo toàn nhưng 8 Invoice/8 revenue tháng 10 không còn hiện hành. Không gọi biên nhận nhập 417/66 ban đầu là số hiển thị hiện hành sau owner mở lại kỳ. API doanh thu còn có bộ lọc trạng thái/đã duyệt, không đồng nghĩa tổng hàng native. 37 source archives cũ giữ riêng; 8 hồ sơ October mới lưu có trang lịch sử kỳ riêng. Owner tự nhập lại, không tự phát hành hoặc ký chứng từ thay owner.

Linux Node 22, CPU 0,3 / RAM 512 MB / heap 192 MB cũng đạt **545 checks** trên clone độc lập, có thử upload lại PDF nguồn và bảo toàn toàn bộ 451 bytes-hash như Windows. Standard Docker release đã build thành công. Source `ecfbf45552ba71a8a733276591250b164ccbd633`, release một website `ab0cdb2556a1ace9324eb08f6abf03af3dd8e59c`, 141 file, không donor records/secrets, đã push đúng hai nhánh DGC. Không có schema migration mới. Host đang triển khai v18; chưa ghi nhận apply thực tế tại mốc bổ sung này.

[Hướng dẫn owner tự nhập lại](../DGC_OCTOBER_REENTRY_GUIDE.md) đã chuẩn bị; chỉ báo kỳ đã sẵn sàng sau khi biên nhận archive và kiểm nguồn hiện hành trên host xác nhận.

## Đã áp dụng trên host thật

V18 đã trực tuyến từ đúng release nêu trên. Backup PostgreSQL trước thao tác lúc 10:41 ngày 05/11, 2,4 MB, Thành công. Preview trên host khớp 8 Invoice Draft/8 revenue/5 recon/18 PDF, không có AR/receipt/Input Recon/tham chiếu chặn; đã lưu lịch sử thành công lúc **10:46:04 giờ Việt Nam** theo ủy quyền owner. API đọc lại archived=true, canRestart=false và đúng counts. Không áp lại thao tác trên sổ thật để thử replay.

Đã đọc API sau apply: tháng 10 có **0 Invoice / 0 revenue hiện hành**; danh sách Invoice toàn sổ còn **58**, danh sách revenue đã duyệt với details=true trả **401** (khác tổng hàng native vì bộ lọc trạng thái). Năm service MCAVM-ISIGN/CRBT/MEETME/MEUPAR/MOVTV đều ALLOW_INTAKE, uploads/reconciliations/invoiceScopes hiện hành trong tháng đều 0. Không upload, chốt đối soát hoặc tạo Invoice mới thay owner.

Tải lại ba PDF đại diện từ trang lịch sử (Invoice, Recon gốc, bản ký) đều khớp SHA256 đã lưu. Công nợ mở vẫn tám Invoice / 25.328,54 USD, VND 0. Backup PostgreSQL sau thao tác lúc 10:47, 2,4 MB, Thành công. Backup website/kho chứng từ sau cấu hình lúc 09:14 đã có đầy đủ blob, thao tác mở lại kỳ không ghi/xóa blob. Chưa restore thử hai DB backup mới; không tuyên bố đã làm việc này.

Proof riêng tư: `artifacts/dgc-migration/20261105/workflows/host-restart-receipt.json`, `host-current-counts.json`, `host-intake-ready.json`, `host-ar-after.json`, `host-archive-download-proof.json` và các ảnh trước/sau. Chỉ kiểm transfer/runtime, không quay lại thẩm định tính hợp lệ tiền lịch sử. Hướng dẫn owner sử dụng ngay đã liên kết ở trên.
