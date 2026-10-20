# Quyền nhập tỷ giá DGC — 20/10/2026

**Owner cập nhật:** [nhân viên kế toán được nhập tỷ giá và chuẩn bị đối soát](DGC_ACCOUNTING_PREPARATION_20261020.md). Có mẫu DGC_ACCOUNTANT và phần nhập tỷ giá ở hai màn hình đối soát. Giới hạn Manager/BOD bên dưới là mapping ban đầu từ donor, không còn là giới hạn cho kế toán target.

Đã tách tạo tỷ giá DGC khỏi SYSTEM_CONFIG_EDIT bằng REVENUE_FX_CREATE. Donor `53_InputRecon_AP.js:6`, `createFxRate`, cho Manager/BOD thao tác. Target chỉ tạo tỷ giá báo cáo VND/USD theo tháng; Staff đọc qua REVENUE_VIEW, theo generic fxRates reader `01_AppShell.js:276`. Tất cả target readers vẫn yêu cầu đăng nhập.

Hai POST `/revenue-fx` và `/revenue-fx/import` dùng quyền mới cho company DGC từ session, giữ Origin/CSRF và strict payload. DGC có riêng SYSTEM_CONFIG_EDIT không tự được quyền FX; tenant GST giữ quyền cũ. API GET trả canCreate, UI dùng flag này thay vì đoán từ quyền cấu hình chung.

Mẫu Manager/BOD thêm REVENUE_FX_CREATE; Staff không có. Không tạo/gán role cho người dùng thật. Baseline seed thêm permission vào ADMIN kỹ thuật; chưa chạy seed trên staging thật. Cần provision quyền mới trước khi triển khai cho role hiện có.

UI có mục Tỷ giá báo cáo riêng cho DGC có REVENUE_VIEW. Manager truy cập được mà không mở tài sản ký hoặc tài khoản quỹ. Bảng có 10 dòng/trang, trước/sau, trang/tổng; giữ chế độ xem kỳ mới nhất và tìm năm/tháng hiện có. Giao diện của GST vẫn đi từ cấu hình chung.

## Hành vi được giữ và giới hạn

- Decimal, định dạng rate và kỳ, nguồn bắt buộc, audit theo actor, một config theo company/tháng và transaction batch giữ nguyên.
- Kỳ đã tồn tại trả 409, không ghi đè. Batch có một kỳ xung đột hoàn tác cả config mới và audit. Kỳ trùng trong payload trả 422.
- Tỷ giá chỉ dùng báo cáo và generator mới; không sửa tiền tệ/số tiền nguồn, Invoice/AR/AP hoặc cash. Không thêm MZN và không đổi SOA cutoff/timezone.
- **Chưa đủ parity toàn bộ FX donor**: donor có upsert kỳ đang Active, from/to/status/default source; target đang create-only, USD/VND, validation/nguồn tường minh. Không âm thầm cho sửa tỷ giá đã được dùng trong source snapshot InputRecon.
- Chưa xác nhận browser cho mục mới và phân trang trong đợt này; build/API không thay nghiệm thu UI.

## Kiểm chứng

- Build toàn workspace Node 22/pnpm 10 đạt.
- Role/manual/FX integration: **149 assertions đạt**. Có Manager/FX-only tạo và batch, Staff/config-only bị chặn, không mở profile/assets/cash-account configuration, CSRF/origin/tenant, chống ghi đè, batch rollback cả audit, giữ nguyên source revenue, GST fallback, thu hồi quyền và kiểm tra role templates.
- InputRecon/AP **187**; tài chính nền **264** và characterization **85** đạt.
- DB fixture mới schema 21, kết nối trực tiếp namespace PostgreSQL container, connection_limit=5. Không thay schema, staging snapshot, source Sheets hoặc tài khoản thật. Không push/deploy.

Cập nhật tiếp: [đọc lịch sử thu cho Staff](DGC_RECEIPT_READ_20261020.md) đã tách khỏi PAYMENT_VIEW; quyền này còn mở báo cáo quỹ và không được gán cho Staff.
