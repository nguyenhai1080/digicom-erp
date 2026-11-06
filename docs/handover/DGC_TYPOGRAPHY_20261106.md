# Font giao diện Digicom — 06/11/2026

Owner yêu cầu chữ hài hòa tổng thể từ ảnh Dashboard. UI v0.6.87 dùng Segoe UI có sẵn trên Windows, fallback Arial/Helvetica/sans-serif, không tải font ngoài. Phạm vi CSS được giới hạn theo companyCode=DGC ở thuộc tính trình bày trên HTML; áp dụng cả login và popup ngoài shell. GST giữ CSS trước đó.

Phân cấp: h1 26px/600 (mobile 24), h2 20px/600, h3 16px/600, menu 13px/500 (active 600), nhãn/nút 600, mô tả thường 400. KPI số 20–26px/600 và tabular-nums; trạng thái dạng chữ 17px/400 màu muted để không cạnh tranh với số tiền. Component DashboardMetric chỉ thêm lớp CSS cho chuỗi trạng thái; nội dung số, phép tính và API không đổi. Sidebar vẫn gọn và đủ mục.

Build TypeScript/Vite và 89 browser checks dùng GET giả lập đạt: font/hệ phân cấp, số tiền dài giữ nguyên, trạng thái nhỏ hơn KPI số, menu đủ tại năm kích thước, branding/login/tab/quyền/mobile/GST. Đã xem ảnh Dashboard; chứng cứ private artifacts/sidebar-layout-check/typography*. Không thay CSS hoặc nội dung PDF/chứng từ, dữ liệu thật, quyền, backend/schema/env. Font thực tế dùng fallback nếu thiết bị không có Segoe UI.

Chuẩn bị gói codex/dgc-deploy, chờ owner triển khai và Ctrl+F5; chưa xác nhận host lên v0.6.87.
