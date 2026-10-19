# Quản lý tài sản công ty

Scope: logo, dấu, chữ ký, ảnh chức danh/họ tên, ảnh ghép ba thành phần và template Invoice. Chốt đối soát và phát hành Invoice dùng phiên bản tài sản đã xác nhận trong luồng nghiệp vụ riêng.

Donor DGC v61 `02_Setup_Config.js:setupStampInvoiceConfigV196` và `41_Invoice_PDF.js:DGC_loadStampAssetsV196_` dùng file ảnh PNG/JPG của COMPANY_STAMP_FILE_ID, SIGNATURE_FILE_ID, SIGNER_TITLE_NAME_FILE_ID. ERP lưu tài sản riêng theo công ty thay cho Drive File ID. Ảnh ghép SIGNING_COMPOSITE theo yêu cầu rõ ràng của chủ GST; không tự tách/vẽ lại chữ ký. Template XLSM theo file người dùng cung cấp được giữ nguyên, không chạy VBA.

Ngày 19/10/2026, owner cũng cho phép **DGC ghép dấu, chữ ký và chức danh thành một ảnh chèn duy nhất** cho đối soát. Tại Tài sản công ty, upload đủ ba ảnh gốc → Xem ảnh ghép → kiểm tra PNG → nhập lý do → Lưu và dùng ảnh ghép. Có thể upload trực tiếp ảnh SIGNING_COMPOSITE đã chuẩn bị. Invoice DGC tiếp tục dùng dấu và chữ ký riêng theo adapter hiện tại.

Bản ghép là PNG có nền trong suốt, bố trí dấu bên trái, chữ ký bên phải và ảnh chức danh/họ tên phía dưới. Giữ màu/tỷ lệ của ảnh, không tự xóa nền trắng hoặc vẽ lại chữ ký; các byte gốc vẫn giữ nguyên. Bản ghép có giới hạn 5 MB, phiên bản và lịch sử riêng. Preview chưa ghi tài sản; lưu yêu cầu đúng source IDs/digest/expectedCurrentId. Nguồn thay đổi yêu cầu preview mới. Audit `COMPANY_ASSET_COMPOSE` giữ layout, ID/version/checksum của ba ảnh nguồn. Hai POST mới: `/api/v1/company-assets/signing-composite/preview` và `/create`, cùng quyền SYSTEM_CONFIG_EDIT, Origin/CSRF và company lock như upload.

## Sử dụng

Đăng nhập tài khoản có quyền SYSTEM_CONFIG_EDIT → Tài sản công ty → chọn loại → chọn file → nhập lý do → Upload và sử dụng phiên bản này. Ảnh PNG/JPEG hoặc template XLSX/XLSM tối đa 5 MB. Template cũ XLS phải chuyển thành XLSX/XLSM trước.

Phiên bản mới thay tài sản hiện hành của cùng loại, file cũ giữ nguyên. Bật Hiện lịch sử phiên bản để tải bản trước. Có thể tải một bản cũ rồi upload lại thành phiên bản mới nếu cần quay lại. Không có xoá vật lý tài sản. Giới hạn danh sách là các tài sản hiện hành và 500 bản cũ gần nhất, có thông báo nếu vượt giới hạn.

## Storage và tính toàn vẹn

- API GET/POST `/api/v1/company-assets`; GET `/api/v1/company-assets/:id/download`.
- Dùng quyền SYSTEM_CONFIG_EDIT hiện có, không tự cấp thêm quyền. POST yêu cầu đúng Origin và CSRF. Company ID lấy từ phiên đăng nhập.
- Attachment/Document hiện có; entityType CompanyAsset, entityId company UUID, documentType là loại tài sản. Không cần migration hoặc seed dữ liệu trên staging.
- `/app/storage/company-assets/{companyId}/{attachmentId}.{png|jpg}`; template `/app/storage/invoice-templates/{companyId}/{attachmentId}.{xlsx|xlsm}`.
- Validate ảnh upload bằng decode, tối đa 20 triệu pixel; chỉ một ảnh được kiểm tra tại một thời điểm. Upload giữ byte gốc. Ghép ảnh tạo derivative PNG riêng bằng sharp và chỉ xử lý một yêu cầu ghép tại một thời điểm.
- Validate cấu trúc workbook ZIP, kiểu workbook, số entry và tổng kích thước giải nén. Chỉ đọc XML xác minh; không thực thi macro. Đây không phải công cụ kiểm tra nội dung invoice hoặc quét malware.
- File tạm `.pending`, flush và rename trước khi ghi metadata. Company row lock, expectedCurrentId chống thay thế trên dữ liệu cũ; tăng version và chuyển bản trước sang SUPERSEDED trong một transaction có audit. Lỗi transaction xoá file vừa tạo.
- Tải cả lịch sử qua API theo công ty; kiểm tra đường dẫn, file thường/kích thước/SHA-256, no-store, nosniff, attachment disposition. Không public folder hoặc commit tài sản thật vào Git.
- Crash giữa rename và database commit vẫn có thể để lại file mồ côi; không tự xoá hồ sơ theo lịch. Backup cần cả metadata database và thư mục persistent.

## Kiểm tra

`pnpm build`; với DATABASE_URL của database thử nghiệm bắt đầu `erp_execution_acceptance_`, chạy `pnpm --filter @erp/api test:assets`. Suite dùng ảnh/workbook tổng hợp, không import hồ sơ tài chính hoặc tài sản ký thật làm fixture. Kiểm tra tenant, quyền/CSRF, concurrent versions, stale/duplicate uploads, byte gốc, tamper, history, audit, restart và proxy binary/large body.

## Chưa bao gồm

Upload asset không tự đóng dấu chứng từ, không thay Invoice cũ và không chốt doanh thu. Luồng nghiệp vụ tiếp theo phải snapshot phiên bản template/tài sản dùng cho mỗi chứng từ. Xem `DGC_OUTPUT_RECON_CORRECTED_WORKFLOW.md`.
