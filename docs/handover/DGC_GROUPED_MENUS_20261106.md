# Gộp menu nghiệp vụ DGC — 06/11/2026

Theo yêu cầu owner, UI v0.6.82 tổ chức:

- Đối soát: Đối soát đầu ra / Tạo Invoice / Đối soát đầu vào.
- Quản lý Công nợ: Công nợ phải thu / Công nợ phải trả.
- Quản lý Invoice: Invoice đã phát hành / Invoice chưa phát hành / Invoice lịch sử.
- Tỷ giá báo cáo nằm trong Cấu hình chung; bỏ mục menu riêng và khối tỷ giá ở màn đối soát.

Tạo Invoice chuyển từ khối nằm dưới upload sang tab riêng trong cùng nhóm Đối soát, thay bố cục v0.6.80. Màn Invoice chuyên quản lý các bản đã/chưa phát hành và lịch sử. Giữ liên kết hồ sơ tháng 10 trong tab lịch sử. Menu cuộn v0.6.81 vẫn áp dụng.

Tab chỉ hiện khi đủ quyền hiện có. Nhóm mở được nếu có ít nhất một tab: RECON_VIEW, INVOICE_VIEW + INVOICE_CREATE, INPUT_RECON_VIEW; công nợ dùng AR_VIEW/AP_VIEW riêng. Cấu hình chung mở cho REVENUE_VIEW hoặc SYSTEM_CONFIG_EDIT; chỉ REVENUE_VIEW được đọc tỷ giá, chỉ SYSTEM_CONFIG_EDIT tải tài sản/mẫu/chữ ký. Không mở rộng quyền quản trị cho kế toán. Tab chỉ tải dữ liệu khi được chọn; phím trái/phải/Home/End đổi tab và focus. GST giữ màn cũ.

Kiểm tra TypeScript/Vite build và 31 kiểm tra browser trên bản build thật với API giả lập chỉ GET: nhóm/tab đúng thứ tự, danh sách Invoice tải đúng publication, không có form tạo trong tab chưa phát hành, mở lịch sử, tỷ giá trong cấu hình, phân quyền từng nhóm, chặn gọi API tab không có quyền, bàn phím, mobile không tràn ngang và GST giữ bố cục cũ. Đã xem ảnh desktop/mobile. Bằng chứng private artifacts/sidebar-layout-check/grouped-tabs*. Không chạy nghiệp vụ thật hoặc ghi host; không đổi backend, schema, env hay quyền tài khoản.

Đã chuẩn bị nhánh triển khai codex/dgc-deploy; owner triển khai lại và Ctrl+F5 để kiểm tra trên host. Chưa tuyên bố host đã lên v0.6.82 hoặc nghiệm thu tài chính.

## Cập nhật tiếp theo — UI v0.6.83

Owner đổi tên menu thành **Quản lý đối soát**, sắp thứ tự **Quản lý đối soát → Quản lý Doanh thu → Quản lý Invoice → Quản lý Công nợ**. Bỏ SOA khỏi sidebar và thêm **Statement of Account** làm tab thứ tư trong Quản lý Invoice, dùng nguyên component SOA và phần đối chiếu khoản thu theo ngày chốt. Chỉ hiện khi đủ AR_VIEW + INVOICE_VIEW + INVOICE_PAYMENT_VIEW; quyền tạo SOA vẫn do INVOICE_CREATE kiểm riêng. Tab chưa chọn không tải SOA, không phát sinh quyền hoặc giao dịch thật.

Build TypeScript/Vite và 36 kiểm tra browser với phản hồi GET giả lập đạt: tên/thứ tự menu, bốn tab Invoice, mở SOA, thiếu quyền không thấy/gọi SOA, các nhóm tab trước, mobile và GST. Private artifacts/sidebar-layout-check/invoice-soa-tabs*. Chuẩn bị nhánh triển khai; chưa xác nhận host đã lên v0.6.83.

## Cấu hình chung theo tab — UI v0.6.84

Owner yêu cầu tách chức năng Cấu hình chung. Ba tab: **Tỷ giá báo cáo**, **Cấu hình Invoice**, **Tài sản và chữ ký**. Tỷ giá vẫn cần REVENUE_VIEW; hai tab còn lại cần SYSTEM_CONFIG_EDIT. Chỉ tải chức năng khi tab được chọn. CompanyAssets có tùy chọn ẩn cấu hình Invoice nhúng để không lặp lại biểu mẫu trong tab tài sản; mặc định cũ giữ nguyên cho nơi khác/GST. Ghép ảnh và quản lý phiên bản vẫn ở tab tài sản, không upload hoặc thay ảnh thật.

Build TypeScript/Vite và 44 kiểm tra browser GET giả lập đạt: ba tab, tải riêng profile/assets, không lặp form, tài khoản chỉ xem tỷ giá hoặc chỉ quản trị, hồi quy nhóm menu/SOA, mobile/GST. Private artifacts/sidebar-layout-check/settings-tabs*. Gói triển khai v0.6.84 chuẩn bị trên codex/dgc-deploy, chờ owner triển khai; không đổi API/schema/env/role hoặc dữ liệu host.

## Menu gọn, bỏ tiêu đề và thanh cuộn — UI v0.6.85

Owner yêu cầu bỏ chữ QUẢN LÝ phía trên Dashboard và giảm cuộn menu. DGC bỏ dòng tiêu đề đó, giảm padding/khoảng cách của mục menu và phần đầu/cuối; màn cao dưới 700px dùng khoảng cách gọn hơn. Ẩn thanh cuộn của nav/sidebar, bỏ khoảng trống dành cho scrollbar. Vẫn giữ cuộn/focus dự phòng nếu viewport quá thấp, để không cắt mất chức năng. Thay đổi chỉ scope .dgc-shell, GST giữ kiểu cũ.

TypeScript/Vite build và 74 kiểm tra browser GET giả lập đạt. Toàn bộ 11 mục menu vừa vùng nav, không cần cuộn tại 1366×768, 1280×720, 960×540, 900×600 và 720×480; không còn nav-title, thanh cuộn ẩn, mục cuối nằm trong viewport. Hồi quy tab/permission/mobile/GST đạt, đã xem ảnh 960×540. Private artifacts/sidebar-layout-check/compact-menu*. Gói v0.6.85 chờ owner triển khai, không thay dữ liệu/quyền/API.
