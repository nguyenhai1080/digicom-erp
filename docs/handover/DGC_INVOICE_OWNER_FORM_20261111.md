# Mẫu Invoice MOVTV và ảnh xem trước — v0.6.99

## Phạm vi và mẫu chủ sở hữu

Mẫu đúng owner gửi ngày 11/11 là Movtv INV 08 2026.pdf. Hai file REGISTAR/GST gửi trước đã được owner rút lại, không dùng làm mẫu. Đã đọc/render PDF chuẩn một trang A4, lấy tọa độ và font làm tham chiếu; không chạy script trong tài liệu, không đưa PDF hoặc ảnh chữ ký thật vào Git.

## Sửa

- Renderer Digicom riêng dùng font Helvetica tương thích Arial, fallback Unicode; logo trái/INVOICE phải, hai cột metadata (ngày d/m/yyyy), khung From/To cạnh nhau, bảng viền đầy đủ 5 cột với tổng gộp hai ô đầu, bằng chữ, ngân hàng, lời cảm ơn, vùng ký và chân trang theo mẫu MOVTV. USD/VND giữ nguyên tính toán và độ chính xác; phần bảng dùng đúng mô tả/số tiền đầu vào.
- Giữ tên pháp nhân, logo, ngân hàng và ảnh ký từ cấu hình hiện hành; không chép nội dung hay ảnh ký từ mẫu để ghi đè cấu hình. Không thêm tài khoản/quỹ hoặc giao dịch tiền. Không thay đổi mã Invoice/tenant/nguồn.
- Có ngắt trang cho nội dung dài, không cắt mất dòng để ép một trang. Vùng ký có đủ chỗ theo kích thước ảnh thực và ở trang cuối dưới thanh toán, kiểm tràn trang/đè nội dung như trước. Thông tin quá dài báo rõ.
- resourceVersions.rendererRevision=DGC_MOVTV_202609_V2 tham gia digest và snapshot mới để buộc preview cũ phải tải lại sau thay mẫu. Adapter layout DGC_V61_V1 giữ tương thích. GST renderer không đổi.
- Lỗi trang kéo dấu là CSP img-src thiếu blob:, trong khi UI nhận PNG bằng POST và tạo URL ảnh tạm. Chỉ bổ sung blob: cho ảnh, không nới script/connect/frame policy.
- Canvas đợi ảnh trang tải thành công mới hiện dấu/chữ ký; lỗi ảnh có thông báo và cách thử lại. Mỗi ảnh tạm mới khởi tạo lại canvas; giữ yêu cầu xem PDF và xác nhận trước lưu.

## Kiểm chứng

- Build API/web đạt; unified-web 69 assertions giữ API/auth/path isolation và kiểm CSP ảnh/blob, script/connect chỉ self.
- Characterization Invoice đạt: USD/VND, mô tả/tiền bất biến, bundle/last-line adjustment, chống cộng trùng, đánh số, vị trí ký, một trang cho 8 dịch vụ thường và ảnh dấu vuông, ngắt trang cho 45 dòng.
- 16 browser checks với Fastify/CSP thật và API giả lập: policy cũ tái hiện lỗi blob; policy mới tải được ảnh và hai lớp ký; ảnh hỏng báo rõ/không có overlay; không gọi create thật, nút lưu còn khóa trước xem PDF/xác nhận.
- Render và nhìn lại bản giả lập 2/8/45 dòng; kiểm text nằm trong khổ giấy, thanh toán và người ký ở trang cuối. 8 dịch vụ ở một trang, 45 dòng ở ba trang.
- Linux Node22, CPU0.3/RAM512MB/heap192MB, PostgreSQL16 giả lập riêng: 153 API assertions đạt, gồm PNG preview thật, PDF/workbook, profile/version/quyền, digest nguồn cũ, hoàn tác file/DB, lưu nháp/phát hành/AR và USD/VND, không cash posting. PostgreSQL thử mới dùng tmpfs; không dùng DB đã khôi phục hay sổ thật.
- Bằng chứng private trong artifacts/invoice-form-20261111. Không suy thử nghiệm giả lập thành nghiệm thu thật.

## Triển khai

Phát hành source dgc/main và nhánh một website codex/dgc-deploy. Owner triển khai lại rồi tải lại trang, vào Tạo Invoice và Xem trước Invoice lại để nhận bố cục/vị trí/digest mới. Không dùng preview cũ. PDF đã lưu giữ nguyên; bản nháp thay thế chỉ tạo qua thao tác bình thường của owner. Không ghi lại PDF lịch sử, phát hành Invoice, nhập sổ, sửa quyền/env/schema/cash hay thao tác host trong lượt này.
