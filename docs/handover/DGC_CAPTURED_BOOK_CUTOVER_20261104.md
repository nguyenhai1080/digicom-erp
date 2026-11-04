# Cắt chuyển nguyên trạng sổ DGC — 04/11/2026

**Cập nhật 05/11: [gói này đã nhập thật trên host DGC](DGC_HOST_BOOK_IMPORT_20261105.md).** Biên nhận imported=true, đủ các counts bên dưới, không historical cash posting. Những ghi chú chưa nhập/đang chuẩn bị sau đây là lịch sử trước khi apply; không chạy lại bộ nhập hoặc tiếp tục semantic audit.

Owner xác nhận tiếp: quỹ/ngân hàng và số dư tiền để sau, chỉ triển khai khi owner yêu cầu. Không dùng thiết lập sổ tiền làm điều kiện cắt chuyển. Ưu tiên luồng nghiệp vụ tài chính dịch vụ chạy đúng; thu lịch sử giữ nguyên và không post vào tài khoản tiền.

Owner đã đổi ưu tiên: không tiếp tục thẩm định tính hợp lệ nghiệp vụ của số liệu cũ. Chuyển đầy đủ sổ hiện có sang ERP, giữ nguyên tiền, ngày, trạng thái và chứng từ; dùng nền tảng chức năng đã xây dựng từ ERP GST. Các lệch nguồn/PDF đã biết được lưu thành cảnh báo, không chặn nhập lịch sử. Phạm vi toàn sổ vẫn giữ, không đổi sang số dư đầu kỳ hoặc backfill sau.

Chỉ kiểm tính toàn vẹn khi chuyển: đúng DGC, đủ hàng, đúng số đã chụp, biểu diễn được trong DB, không trùng/ghi đè, không sinh cash posting cho thu lịch sử. Không chạy thêm vòng chứng minh làm tròn/native/FX hoặc yêu cầu owner duyệt lại các lệch cũ. Các importer master/evidence và công cụ rollback cũ không được nới guard; bộ nhập sổ vận hành là đường riêng.

Mốc trial đã hoàn tất là 47 Invoice, 958 assertions. Lượt thử 53 không hoàn tất: log dừng ở assertion kỳ vọng zero held nhưng thực tế 38. Không tính 53 là đạt và không tiếp tục xử lý semantic holds theo đường này. Chưa nhập tài chính thật hoặc cắt chuyển.

Đã dựng bộ nhập vận hành riêng, có upload chứng từ theo phần nhỏ, preview/rollback và apply theo gói ghim. Không dùng hoặc mở lại master/evidence importer cũ.

Đọc sổ hiện tại ngày 04/11 qua Google Drive/Sheets: 3.154 hàng cũ không đổi giá trị, thêm 89 hàng; giữ nguyên snapshot/decisions cũ và lưu phần phát sinh bằng appendix riêng, không rebase quyết định. Gói hiện tại có 3.243 hàng nguồn, 417 revenues, 66 Invoice hiện hành/nháp, 37 Invoice archive, 53 AR, 51 receipts, ba Input Recon Generated và 82 SOA/package documents. 451 PDF / 439.497.950 bytes từ ba manifest và 22 file mới; năm original Recon thiếu vẫn được ghi rõ. Private gói `artifacts/dgc-migration/20261104/captured-book/latest-bundle.json`, hash `00d29bbc28b33fb9faecf258e2d32733086a9884874361102862d862998e3b85`.

Clone/Linux giới hạn 512 MB, Node heap 192 MB: 43 HTTP checks đạt, gồm prepare/upload, preview rollback, apply/replay, đủ Invoice, đọc archive/PDF, duyệt một Input Recon và ghi khoản thu chỉ giảm AR; không có CashEntry/CashAccount. Tám kiểm tra tiếp theo xác nhận nguồn tháng 10 dùng được, phát hành năm Invoice đúng một lần, chặn phát hành lại nguồn trùng và cho phép xem hủy nháp còn lại. Các thao tác này chỉ chạy trên DB synthetic, không chạy trên host.

Nguồn có các phương án Draft cùng revenue. Scope source có cờ riêng và guard DGC, không đổi trạng thái/money hoặc bỏ unique guard cho scope native. Khi phát hành, giữ phương án người dùng chọn; các source set khác chọn Draft captured mới nhất, giữ các phương án còn lại nguyên trạng. Issue khóa kỳ/công ty và chặn nguồn đã phát hành; hủy nháp không giải phóng nguồn còn được Invoice khác sử dụng. Các Profile/audit cũ không quyết định admission cho đường nhập này.

Archive không thành công nợ hiện hành; Draft không tự phát hành; Generated input không tự duyệt/AP; thu lịch sử không vào số dư ngân hàng. Khoản thu mới có chế độ LEDGER_ONLY với quyền thu hiện tại, USD/VND và ngày thực nhận; không yêu cầu hoặc ghi tài khoản tiền. DGC_CASH_ENABLED mặc định false; không tạo account/opening balance. Actor/ngày raw, ký hiệu nguồn và cảnh báo chứng từ giữ riêng; issuedAt native là ngày lịch nguồn, raw serial/timezone vẫn giữ trong snapshot.

Host đã xác định đúng Digicom-Erp `cmvkgp9h30auw0i5fuqpsqez2`, v14, branch codex/dgc-deploy, CPU 0.3 / RAM 512 MB. Đã tạo backup website và PostgreSQL trước triển khai (04/11). Mã/bộ phát hành mới đang chuẩn bị; chưa financial import host hoặc công bố cutover. Gate master/evidence/bootstrap/seed phải tiếp tục false. Chỉ gate DGC_CAPTURED_BOOK_ENABLED/hash dành cho lượt chuyển mới; tắt sau nhập.
