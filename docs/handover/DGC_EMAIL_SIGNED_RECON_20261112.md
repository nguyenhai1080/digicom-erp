# Sửa tệp đối soát đính kèm email — v0.6.106 — 12/11/2026

## Phản hồi và nguyên nhân

Owner thấy Invoice đúng nhưng đối soát trong email là PDF gốc chưa chèn dấu/chữ ký. v0.6.105 dùng bộ đọc `DGC_SOURCE_RECON` cho nguồn captured; bộ đọc này có chủ đích trả tệp gốc. Trong nguồn đã chuyển, bản đã ký nằm ở `55_APPROVAL_PACKAGE` và đã được nhập riêng thành `APPROVAL_PACKAGE`/`DGC_SOURCE_REFERENCE`. Không cần ký lại, nhập lại hoặc sửa tệp nguồn.

## Thay đổi

- Email captured dùng resolver mới theo physical source row trong `43_RECON_PDF_HEADER`, các snapshot được biên nhận transfer xác nhận, và row/link của `55_APPROVAL_PACKAGE`.
- Chỉ bản nguồn Approved, document ACTIVE, cùng công ty/đối tác/kỳ, liên kết rõ `Related_Recon_Doc_IDs` mới được xét. `Related_Revenue_IDs` phải khớp doanh thu hiện hành của các đối soát đang chọn; bản ký của doanh thu cũ bị loại. Không chọn theo tên file, số thứ tự APP hay timestamp mới nhất.
- Bản gộp phải nằm trọn trong các Invoice/đối soát/doanh thu đã chọn; không gửi thêm phạm vi không chọn. Tệp được dedup và kiểm path/size/SHA256 như trước. Nhiều ứng viên còn hợp lệ hoặc thiếu bản ký đều chặn gói email, không fallback sang original.
- Nhãn `Đối soát đã ký`, tên có mã hồ sơ APP và kỳ. Liên kết xem PDF và bytes đính kèm cùng lấy chính bản đã ký qua endpoint read-only có quyền và phạm vi tương đương composer.
- Luồng native đã dùng finalization.documentId vẫn giữ nguyên, nhãn rõ `Đối soát đã chốt`. Gửi email không phát hành Invoice; không tự gửi lại email cũ.
- Giữ nguyên bộ đọc PDF gốc tại lịch sử đối soát, mọi PDF/số tiền/trạng thái/hồ sơ nguồn/SMTP/cash/roles/schema.

## Kiểm tra

- API/web builds đạt.
- 89 route assertions trong DB PostgreSQL giả lập mới: toàn bộ email regression cũ; original/signed cùng tồn tại nhưng chỉ signed được chọn; link tải đúng signed bytes/checksum, dedup, approved/base+appendix provenance, loại bản ký của revenue cũ, thiếu/Draft/sai kỳ/sai đối tác/ngoài selection/nhiều ứng viên/file tamper/foreign tenant đều chặn; không thay đổi finance snapshot. Transport giả lập, không gửi email thật.
- 24 browser checks và 69 unified web/API đạt.
- Tra cứu metadata capture riêng (không đổi dữ liệu) xác nhận năm nguồn Invoice tháng 09/2026 đều có đúng một bản ký khi xét liên kết current revenue; không mặc định chọn bản gần nhất. Không coi đây là kiểm chứng UI/host hoặc UAT tài chính.
- Linux Node22.23.4 runtime cũng đạt 89 assertions, CPU0.3/RAM512MB/heap192MB, DB giả lập mới. Runtime dùng dependency image v105 và dist vừa build mount read-only; không có dependency/schema change. Lần rebuild toàn image bị dừng và không có kết quả để tuyên bố build Linux mới; API/web build local và runtime Linux đã xác minh. Log riêng: artifacts/invoice-email-signed-linux-runtime.log.

## Bàn giao

Đẩy dgc/main và gói single-site codex/dgc-deploy. Owner triển khai, đóng màn hình email cũ rồi mở **Gửi email** mới để hệ thống gom lại đúng tệp. Kiểm PDF ký trước khi tự gửi. Email đã gửi trước đó không bị sửa/thu hồi/gửi lại tự động. Không có thay đổi SMTP hoặc thao tác tài chính/email thật.

Owner hỏi checkbox “Ghi nhận phát hành lịch sử trong ERP”: đây là ghi nhận Invoice đã gửi/phát hành từ trước cùng lý do nguồn, không gửi email. Với luồng tạo/gửi mới, không tích checkbox lịch sử; chỉ xác nhận đã gửi sau khi thực sự gửi cho đối tác rồi mới phát hành/tạo phải thu.
