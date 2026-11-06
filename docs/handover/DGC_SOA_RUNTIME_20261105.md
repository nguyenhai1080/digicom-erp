# SOA vận hành DGC — 05/11/2026

Nguồn nghiệp vụ: đúng Apps Script v61 `52_StateOfAccount.js`, SHA256 `1b87a7090702aaaa45db3e23d7ca33e713301e3f08ef107ad4a7b41a3f0bb3fa`. Đã đọc preview/create, build dữ liệu, ba ảnh ký trang cuối, renderer/footer và xóa Draft. Quyết định owner 23/10 thay cách cộng mọi khoản thu của donor bằng khoản thu đến hết ngày chốt; không đổi số sổ/PDF cũ.

## Luồng mới

Statement of Account trong menu DGC: chọn đối tác, ngày chốt, USD/VND và có/không gồm Invoice đã trả đủ tại ngày chốt. Chỉ lấy Invoice hiện hành đã phát hành, có AR hiện hành; không lấy Draft/Cancelled/Superseded hoặc Invoice sau ngày chốt. Mỗi SOA chỉ một tiền tệ. Dữ liệu/tổng dùng Decimal; số đã thu sau ngày chốt không giảm số dư quá khứ. Màn đối chiếu cũ còn trong phần mở rộng.

Xem trước tạo PDF trong bộ nhớ, không ghi file/sổ. Có thể chỉnh vị trí dấu, chữ ký, chức danh/họ tên; ba ảnh gốc DGC chỉ chèn trang cuối, độc lập ảnh ghép Recon v3. PDF kế thừa thông tin đối tác, logo, cấu hình pháp nhân/thanh toán và sáu cột của donor; Noto Sans hỗ trợ Unicode, phân trang có kiểm tràn. Không có Payment due by (donor v61 để trống). Tạo số SOA-0001 tăng riêng để tránh số donor bị lặp theo tháng.

Sau kiểm PDF và tick xác nhận, lưu Draft + PDF + snapshot + audit + toàn bộ InvoiceDocumentLink trong một transaction. Khóa các kỳ trước company/Invoice; gọi linkInvoiceDocuments đúng một lần cho toàn bộ tập. Digest ghim actor/lựa chọn/nguồn Invoice-khoản thu/cấu hình/ảnh; nguồn hoặc vị trí đổi phải xem trước lại. requestId chống lưu lặp; lỗi DB/audit hoàn tác file và hàng. Không tạo/đổi Invoice, revenue, AR/AP, khoản thu hoặc CashEntry.

Hủy chỉ Draft có expectedUpdatedAt, lý do và xác nhận. Thay cách xóa/Trash donor bằng CANCELLED, giữ snapshot/PDF/audit; bỏ các liên kết của chính SOA để không khóa hủy Invoice vô thời hạn. PDF đã lưu không tái sinh theo tiền thu/cấu hình mới. Danh sách và preview Invoice đều 10 dòng/trang. SOA nguồn chuyển sổ vẫn ở hồ sơ nguồn cũ, không tự tái sinh hoặc promote thành SOA mới.

## Quyền và lưu trữ

Đọc cần AR_VIEW + INVOICE_VIEW + INVOICE_PAYMENT_VIEW. Tạo/preview/hủy thêm INVOICE_CREATE, ánh xạ nhóm Manager/BOD đã có; Staff/Kế toán đọc, không tạo/hủy. Không thêm permission, seed, sửa role hoặc gán người dùng thật. Các role template chỉ cập nhật ghi chú phạm vi.

Migration mới thêm statements_of_account; FK composite company/partner và company/document ngăn liên kết khác tenant. SOA nằm ở storage/soa/companyId/attachmentId.pdf, kiểm đường dẫn/size/SHA256 khi tải. Các trạng thái và PDF nguồn lịch sử không đổi. Giữ nguyên importers/bootstrap/seed/cash=false.

## Kiểm tra đã đạt trước release

- Web TypeScript/Vite và API TypeScript build đạt; schema/migration triển khai trên PostgreSQL giả lập riêng.
- 131 integration checks: cutoff inclusive, USD/VND, loại Invoice không phù hợp, actor/CSRF/origin/quyền/tenant/FK, source/profile/image thay đổi, rollback file/DB/audit khi create/cancel lỗi, replay/race, full-set links ngăn hủy Invoice, bảo toàn PDF/snapshot khi hủy hoặc nguồn đổi, phân trang và tiền sổ giữ nguyên.
- 64 kiểm tra hồi quy reader SOA cũ đạt.
- UI giả lập: preview đúng 11 Invoice/tổng 1.100,00, thu đến chốt 120,00 và còn 980,00 USD; sang trang 2, tải PDF, lưu SOA-0012, hủy có lý do/xác nhận và còn PDF/hàng lịch sử. Không dùng sổ thật cho lượt thử.
- PDF giả lập render bằng Poppler, đã xem trang đầu/cuối; sửa khoảng logo để tránh chạm thông tin pháp nhân. Chưa coi đây là nghiệm thu của nhân viên thực tế.

Proof riêng dưới ignored artifacts/dgc-migration/20261105/soa; không đóng gói PDF/ảnh nguồn hoặc dữ liệu giả lập vào release. Linux/backup/deploy/kiểm host được ghi sau khi thực hiện, không suy từ build local.

## Đã triển khai và xác minh trên host

Source 18f3c1799a38efa6f6b8e9de33ce7f848a0deb32, release một website f2dc25b5723c79e05e705647406b1b2fb21abdc9 (144 file, không donor records/secrets), v23 trực tuyến ngày 05/11. Linux Node22/0,3 CPU/512 MB RAM/192 MB heap đạt 131 checks; toàn bộ migration áp dụng thành công trên DB trial. DB host backup trước lúc 13:39 và sau lúc 13:47 đều Thành công, 2,4 MB; chưa restore thử hai bản này, không tuyên bố đã làm.

Public health trên erp.digicomjsc.com trả 200/database connected, endpoint SOA không có phiên trả 401. UI asset khớp byte bản đã test: SHA256 71e554d900ef662faa5c09931bf713b7361a0a46ff9e2fb808112b64adb25fdc. Bộ nhập/bootstrap/seed/cash không được mở lại.

Ngày 06/11 đã xác minh qua phiên owner trên tên miền chính thức: menu/form Statement of Account, Movitel, USD/VND, includePaid, chỉnh vị trí và danh sách 0 SOA mới đọc được. GET đối chiếu chốt 05/11/2026 đọc 53 Invoice/6 trang, tổng phải thu ban đầu 742.959,02 USD, thu đến chốt 717.630,48 USD, còn 25.328,54 USD. Đây là kiểm đường đọc và tổng đã ghi nhận, không thẩm định lại tính hợp lệ sổ cũ. Không tạo, ký, hủy hoặc phát hành SOA/Invoice thật. Nghiệm thu tạo tài liệu của người dùng thực tế vẫn để người dùng thực hiện.

Proof private: artifacts/dgc-migration/20261105/soa (Linux, backup, release/public checks), artifacts/dgc-migration/20261106/soa/host-read.txt và host-read.png. Các ghi chú WIP trong tài liệu cũ đã được thay thế bởi mốc này.
