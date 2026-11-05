# Cấu hình Invoice và tài sản DGC đã lưu trên host — 05/11/2026

Kiểm tra sau chuyển sổ phát hiện cấu hình Invoice và kho tài sản công ty trên ERP còn trống. Đã bổ sung qua giao diện quản trị DGC, không sửa bản ghi tài chính, không tạo/phát hành/ký chứng từ và không tạo tài khoản tiền.

## Nguồn và phạm vi

Đọc metadata workbook nguồn đã bàn giao, rồi chỉ đọc khóa cấu hình và hai vùng cần thiết `14_SYS_CONFIG!A72:B84`, `A90:B94`. Không đọc SYS_USERS hoặc bí mật cấu hình. Giá trị gốc nằm trong hồ sơ private `artifacts/dgc-migration/20261105/company-assets/source-config.json`.

Logo lấy nguyên bytes data URI trong `41_Invoice_PDF.gs` của checkout donor. SHA256 toàn file `8cccfb9546b5b89b9ff7b3d5d9aeaeb90cae4ff3979314b1911c8ef77bfc7428` khớp chính xác `docs/DGC_SOURCE_INVENTORY.json` cho deployed v61. Chỉ trích xuất ảnh, không chạy mã donor.

Ba ảnh dấu, chữ ký và chức danh/họ tên được tải qua Google Drive theo đúng File ID cấu hình đang dùng của DGC. Đã xem ảnh trước khi upload; không vẽ lại, tách từ PDF hoặc dùng tài sản GST. Metadata, source IDs và ảnh gốc giữ private.

## Đã thực hiện trên host

- Invoice profile v1 lưu thành công, đọc lại qua API đúng các giá trị nguồn. Địa chỉ nguồn có một newline; trường nhập một dòng trên UI chuẩn hóa newline thành một dấu cách để tránh dính hai từ. Không thay nội dung địa chỉ. Mã số thuế để trống vì không có khóa nguồn trong bộ trường này, không suy từ hình dấu.
- Thông tin người thụ hưởng/ngân hàng/SWIFT chỉ nằm trong profile in trên Invoice. Không tạo CashAccount, số dư đầu kỳ hoặc cash posting; việc owner hoãn ngân hàng/quỹ không bị thay đổi.
- Bốn tài sản gốc v1 ở trạng thái Đang dùng: COMPANY_LOGO, COMPANY_STAMP, SIGNATURE, SIGNER_TITLE_NAME.
- Dùng chức năng Xem ảnh ghép của ERP, kiểm bố cục rồi Lưu và dùng ảnh ghép theo yêu cầu owner 19/10. SIGNING_COMPOSITE v1 là tài sản thứ năm, dùng cho đối soát mới. Không ký bất kỳ chứng từ nào. Invoice tiếp tục dùng dấu/chữ ký riêng theo adapter DGC.

Tải lại bốn file gốc từ chính ERP và so SHA256: cả bốn khớp nguyên bytes với nguồn (19.590 / 348.816 / 48.760 / 143.848 bytes). Ảnh ghép tải lại được và giữ private. Profile API đọc lại version 1, checksum `5e4086b1e785870cf9b35f0f96d789edb6438c68f85cf737412556a46f5cf11c`. Ảnh màn hình và byte proof ở thư mục private trên.

## Giới hạn và tiếp tục

Các chứng từ lịch sử/PDF đã chuyển không tái tạo hoặc restamp. Chưa thực hiện UAT tạo/phát hành Invoice, finalize đối soát hoặc đăng nhập thay nhân viên trên sổ thật. Không cần release hoặc redeploy cho thay đổi cấu hình/tài sản này. Không mở lại các importer, bootstrap hoặc seed; tỷ giá mới do kế toán nhập khi làm việc, không tự suy thêm.

Backup sau cấu hình/tài khoản trên host ngày 05/11 lúc 09:14 đã xác nhận: website/kho dữ liệu ứng dụng/cấu hình Thành công, 843,6 MB; PostgreSQL Thành công, 2,4 MB. Không xóa backup trước đó, chưa tải/restore thử hai backup mới này. Biên nhận book đọc lại sau cấu hình vẫn imported=true/importEnabled=false và counts không đổi. Screenshot `host-configured.png`/`host-five-assets.png`, file profile và byte proof nằm private cùng thư mục; không đưa vào Git.
