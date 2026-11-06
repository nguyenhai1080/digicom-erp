# Hiển thị đối soát đã chuyển — 07/11/2026

Owner báo màn Đối soát đầu ra trống dù đã chuyển sổ lịch sử. Nguyên nhân: bảng cũ chỉ đọc OutputReconUpload của luồng upload mới; 270 nhóm captured nằm trong Reconciliation SYSTEM_IMPORT, không có Upload giả.

UI/API v0.6.89 thêm danh sách **Đối soát đã chuyển từ hệ thống cũ** ngay sau bộ lọc, trước bảng PDF mới. Hiển thị mã nguồn, đối tác, dịch vụ, kỳ, hợp đồng, trạng thái và mở PDF gốc; tìm theo mã/đối tác/dịch vụ, lọc kỳ, 10 dòng/trang. Mặc định chỉ hiện nhóm hiện hành; checkbox bao gồm bản lưu. PDF upload mới và luồng kiểm tra/chốt giữ nguyên; không chế tạo Upload hoặc chạy lại importer.

Hai GET /output-recon/history và /output-recon/history/:id/pdf dùng RECON_VIEW, chỉ DGC và tenant hiện tại. Chỉ đọc SYSTEM_IMPORT có sourceKind DGC_CAPTURED_BOOK_V1, giới hạn partner/contract/service cùng tenant; không trả raw payload, actor hay đường dẫn kho. PDF được giải bằng source physical row (snapshot/sheetId/sourceRow/rowHash/legacyId) và provenance link, kiểm loại/tenant/trạng thái Document + Attachment, đường dẫn dgc-history/companyId/attachmentId.pdf, size/SHA256 bằng checkedFile. Không đoán file bằng tên/legacyId.

Lưu ý snapshot: envelope đối soát base có preparation hash; khi documentSource không có snapshotHash, reader lấy sourceSnapshotHash từ biên nhận DGC_CAPTURED_BOOK_TRANSFER. Snapshot có sẵn trên dòng phải thuộc base/appendix của cùng biên nhận. Không sửa raw/hash hoặc dữ liệu nguồn. Không có biên nhận/link/file đúng thì vẫn hiện đối soát, không cung cấp link PDF.

Đọc trên bản sao backup 06/11 (localhost, READ ONLY): 265 nhóm hiện hành, 5 nhóm bản lưu; lần lượt 259 và 5 nhóm nối được PDF gốc. Sáu nhóm hiện hành không có liên kết original PDF phù hợp được hiển thị rõ, không tự phục hồi hoặc dùng tài liệu khác thay thế. Đây là kiểm độ phủ hiển thị, không mở lại thẩm định số liệu cũ, không phải đọc host ngày 07/11.

Kiểm tra: API + web build đạt; 47 assertions trên DB giả lập mới, gồm dòng base thiếu snapshot riêng, pagination/filter/search/archive, permission/tenant, PDF bytes/tamper, privacy và fingerprint cả 63 bảng không đổi sau đọc. 94 kiểm tra browser phản hồi giả lập chỉ GET đạt, gồm 10 dòng, phân trang, tìm/period, archive toggle, PDF thiếu, tab/permission/mobile/GST. Đã xem ảnh trang lịch sử; private artifacts/sidebar-layout-check/recon-history*. Test có lệnh test:output-recon-history trong apps/api/package.json.

Không đổi schema/env/quyền/tiền/trạng thái/file nguồn; không duyệt, phát hành, nhập lại hoặc thao tác host. Bộ Dashboard kết hợp vẫn là bản phác thảo riêng, chưa triển khai. Đã chuẩn bị nhánh codex/dgc-deploy, owner triển khai lại và Ctrl+F5, chưa xác nhận host lên v0.6.89.
