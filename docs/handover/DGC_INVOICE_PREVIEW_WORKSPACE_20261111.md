# Preview từng Invoice theo DGC cũ — v0.6.102

## Đối chiếu donor và yêu cầu owner

Owner yêu cầu đọc lại DGC cũ và preview từng Invoice để kéo dấu/chữ ký như luồng đối soát. Đã chỉ đọc deployed-v61/Index.html (CSS 149–160, modal 617, các hàm previewInvoiceUi/renderInvoicePreviewWorkspace_/wireInvoiceDrag_/createInvoiceUi từ 2189) và 40_Invoice_Core.js preview/create từ 97. Donor có modal hai vùng: danh sách dịch vụ/Invoice/số tiền trái, bản đang chọn phải; vị trí lưu riêng mỗi Invoice, chỉ ghi khi chốt. Không thực thi donor, copy donor records/assets/secrets hoặc sửa hệ thống cũ.

## Bản mới

- DGC mở modal Preview Invoice sau Xem trước, theo bố cục donor. Sidebar lấy tên dịch vụ tổng được server trả riêng; bundle MCAVM-ISIGN vẫn một mục/ba dòng, không liệt kê thành ba Invoice con.
- Chỉ tự tải ảnh trang đang chọn (trang cuối có vùng ký), không tạo đồng thời N PNG. Ảnh đã tải được dùng lại khi chuyển qua lại; bấm Tải lại trang để thử lại nếu lỗi. Trên tài liệu nhiều trang, mở PDF để kiểm tất cả trang trước khi lưu.
- Kéo dấu và chữ ký trực tiếp trên PNG của PDF thật; map vị trí theo businessKey. Giữ đúng tọa độ riêng khi chuyển Invoice/đóng rồi tiếp tục preview. Chiều rộng/vị trí có thể chỉnh số trong phần thu gọn; khóa trang ký cuối theo bố cục server.
- Thay vị trí làm mất hiệu lực đúng PDF xem trước của Invoice đó và bỏ xác nhận chung. Phải tạo/kiểm PDF cho mọi Invoice, sau đó xác nhận mới lưu cả nhóm Nháp. Giữ endpoint/schema/digest/Origin/CSRF/quyền/scope tổng/atomic transaction/rollback hiện hành; không biến Chốt thành phát hành hoặc tạo AR.
- Để sau/Đóng/Escape chỉ đóng modal, giữ các vị trí/ảnh xem trước để tiếp tục, không ghi sổ. Các nút/drag khóa trong lúc xử lý để tránh yêu cầu chồng nhau.
- Sau khi lưu nháp thành công, có link PDF riêng cho từng Invoice. Các link được tạo từ ID server và đi qua quyền download hiện hành. Không tự mở hàng loạt tab.
- Modal có keyboard tabs và sidebar cuộn riêng; mobile đổi sang danh sách ngang, pane xem trang cuộn trong modal; header/footer luôn dùng được. GST giữ form inline, cách tải preview thủ công và ảnh composite như cũ.
- Không đổi form/font PDF, số tiền, đánh số, asset/config/schema/env/role hay dữ liệu đã lưu. Backend chỉ bổ sung nhãn serviceName của nhóm vào public-plan; không đổi nhóm hoặc digest tài chính.

## Kiểm chứng

- API/web build đạt; 69 unified-web assertions đạt.
- 42 browser checks với Fastify/CSP và API giả lập: chỉ tự tải một Invoice, cache/chuyển lại, kéo hai ảnh/vị trí đúng payload, nhóm ba con trong một mục, PDF bị invalid riêng, không lưu trước đủ PDF/xác nhận, resume/Để sau/Escape/retry, mobile vừa viewport, link PDF sau save. GST inline/composite không đổi; thiếu INVOICE_CREATE không thấy tab tạo. Chỉ mock create, không thao tác sổ thật.
- Linux Node22/0.3 CPU/512MB/heap192MB, PostgreSQL16 tmpfs riêng: 206 API assertions đạt; giữ preview/PDF/workbook/quyền/rollback/scope/sequence/USD/VND và nhóm tám Invoice, bundle ba CHILD chung một TOTAL. Kiểm thêm tên sidebar là tên dịch vụ cha, không lấy tên child. Không dùng DB/sổ thật.
- Đã nhìn lại ảnh desktop/mobile. Mock dùng trang và ảnh ký giả lập, không phải chứng từ nghiệm thu thật. Bằng chứng ở artifacts/invoice-font-20261111/workspace-* và artifacts/sidebar-layout-check/invoice-workspace.mjs (private).

## Phát hành

Đẩy dgc/main và gói một website codex/dgc-deploy; owner triển khai rồi tải lại trang và Xem trước Invoice. Mọi lưu nháp/phát hành thật vẫn do owner thực hiện. PDF đã lưu giữ nguyên, không nhập lại nguồn hoặc khôi phục thử cũ.
