# Tra cứu Invoice lịch sử trong DGC-ERP — 21/10/2026

Tiếp nối [gói 33 Invoice lịch sử](DGC_INVOICE_ARCHIVE_20261020.md). Đã thêm API và màn **Invoice lịch sử** để đọc một gói evidence đã kiểm, không nhập gói vào bảng Invoice/AR/payment hoặc sổ tiền.

Đối chiếu donor v61 `40_Invoice_Core.js`, DGC_findInvoiceV180_: tìm theo số trùng sẽ chọn bản hiện hành duy nhất hoặc báo lỗi. Reader evidence này là phần bổ sung riêng cho migration: trả tất cả bản lịch sử khớp số, chọn chi tiết/PDF bằng archiveId gắn hàng nguồn; không dùng logic chọn current để thay thế một bản lịch sử.

## Cấu hình và quyền

Mặc định chưa kết nối kho. Để bật, operator phải kiểm gói bằng công cụ migration, mount thư mục riêng ở chế độ chỉ đọc và đặt đồng thời:

| Biến | Giá trị |
| --- | --- |
| DGC_INVOICE_ARCHIVE_ROOT | Đường dẫn tuyệt đối đến kho đã verify |
| DGC_INVOICE_ARCHIVE_HASH | archiveHash tin cậy từ kết quả kiểm nguồn độc lập |
| DGC_INVOICE_ARCHIVE_COMPANY_ID | UUID công ty DGC sở hữu kho |

Không lấy hash tự khai trong một kho chưa tin cậy để bật. API không tự chọn thư mục snapshot hoặc bật kho thật. Cấu hình chưa đầy đủ báo 503; chưa cấu hình cả ba thì màn danh sách thông báo chưa kết nối. Mẫu env chỉ thêm comment, chưa đổi môi trường đang chạy.

Cần INVOICE_VIEW, companyCode DGC và UUID khớp cấu hình. GST bị chặn; UUID khác không nhận metadata/PDF. Không cấp quyền mới hoặc gán vai trò người dùng thật. Staff/kế toán đã có quyền xem Invoice theo role target có thể đọc lịch sử tương ứng khi môi trường được cấu hình.

## Hành vi

- GET `/api/v1/invoice-history?invoiceNumber=<số chính xác>&page=1`: mặc định 10 dòng, tổng/trang/trước/sau; các hàng trùng số vẫn tách riêng bằng archiveId theo source row/hash. Chỉ Superseded/Cancelled từ gói, không trộn Invoice hiện hành.
- GET `/api/v1/invoice-history/:archiveId`: header chọn lọc, dòng chi tiết, source address, issue codes và revision pointers, gồm pointer chưa có đích. Không trả raw capturedPayments, bank/note, path filesystem, toàn bộ source payload hoặc URL nguồn Drive.
- GET `/api/v1/invoice-history/:archiveId/pdf`: xác minh byte size/header/SHA-256 rồi trả đúng PDF gốc; tên tải an toàn, nosniff và no-store. Không dựng lại, đóng dấu hoặc ký lại PDF.
- Màn chi tiết giữ số tiền dưới dạng chuỗi nguồn, kể cả âm/bốn chữ số thập phân. Ngày ở bảng dùng formattedValue nguồn nếu có; header nguyên gốc vẫn giữ giá trị raw. Không đoán timezone hoặc tính lại số tiền.
- Bảng dòng chi tiết cũng có phân trang 10. Source Partner_ID chỉ nằm trong header nguồn, không hiển thị legalName trong bảng. Dịch vụ nguồn chưa được ánh xạ thành danh mục vận hành.
- Không có nút sửa/approve/issue/rebill/payment. Không tham gia công nợ, SOA hoặc Dashboard hiện hành, không đăng ký gói evidence như chứng từ SOA.

Mỗi request kiểm manifest/COMPLETE/hash cấu hình và các identity/path/status/cờ của index. Payload đang đọc phải khớp payloadHash; PDF đang mở phải khớp hash byte. Chặn đường dẫn thoát kho và symlink/junction ở root/file/thư mục nội bộ. Reader chỉ mở các path đã ghim trong manifest, không cung cấp endpoint tải file tùy ý. Không đọc lại toàn bộ PDF chưa được yêu cầu; verify nguồn/toàn kho vẫn là bước migration độc lập trước mount.

Đây là runtime đọc evidence filesystem, chưa phải model/importer archive trong PostgreSQL hoặc quy trình retention/backup production. Kho có quyền ghi filesystem vẫn có thể bị sửa; API phát hiện sai digest ở phần đang đọc và báo 409, không tự sửa dữ liệu. Cần mount read-only và quản lý hash/quyền kho khi triển khai.

## Kiểm chứng

- Build toàn workspace Node 22/pnpm 10 đạt.
- `test:invoice-history`: **63 assertions đạt** trên PostgreSQL synthetic riêng: auth/quyền/tenant, config thiếu/tắt, query sai, phân trang/tìm trùng số, ngày formatted/số âm raw, 12 dòng chi tiết, pointer thiếu, không lộ bank/note/path, PDF đúng byte/cache, POST không có, hash/payload/PDF/marker bị sửa và symlink directory thực. Số Invoice/AR/payment/cash/document/audit không đổi khi đọc.
- Fixture browser chỉ tạo gói giả khi DGC_UI_ARCHIVE_FIXTURE=true, dưới guard DB synthetic đã có; không mount gói thật vào web server.
- Kiểm thêm reader với gói evidence thật qua app.inject (không mở listener): đọc đủ 33 hàng/4 trang, tìm đúng một bản lịch sử của số Invoice trùng với bản hiện hành, đọc chi tiết và so byte PDF trả về với PDF trong gói. Số financial/document/audit records trong DB synthetic không đổi. Proof private `artifacts/dgc-ui/20261021/verify-real-history-reader.mjs`; session thử tạm đã xóa, gói thật không được nối vào server web giả lập.
- Cập nhật tiếp: [UI đã kiểm được ngày 21/10](DGC_INVOICE_HISTORY_UI_20261021.md), gồm tìm trùng số, phân trang, header/detail nguồn, retry lỗi kho và tải PDF khớp SHA-256. Đã sửa tìm lại cùng query không reload, thêm link tải PDF. Trình xem PDF inline của browser nhúng vẫn chỉ hiện nền trống; chưa nghiệm thu inline trên browser thông thường.

Chưa kết nối kho thật vào ứng dụng cho người dùng, nhập financial records, deploy/push hoặc provision quyền. SOA cutoff/timezone/ba mapping liên kết lịch sử vẫn chưa có xác nhận mới.
