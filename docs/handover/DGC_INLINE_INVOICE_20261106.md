# Tạo Invoice ngay sau đối soát đầu ra — 06/11/2026

Theo yêu cầu owner, DGC hiển thị biểu mẫu tạo Invoice ngay dưới danh sách PDF đối soát đầu ra. Dùng lại component và API Invoice chuẩn: chọn đối tác/kỳ, xem trước, kiểm tra từng PDF rồi xác nhận lưu nháp. Không tự chốt đối soát hoặc tạo/phát hành Invoice sau upload. Có nút mở Quản lý Invoice để tiếp tục quản lý nháp/phát hành.

Chỉ hiển thị với cả INVOICE_VIEW và INVOICE_CREATE. Chế độ nhúng không tải danh sách Invoice, không hiển thị bộ lọc/phát hành/thanh toán; màn Quản lý Invoice riêng giữ nguyên. API tiếp tục kiểm điều kiện doanh thu đã chốt, quyền và xác nhận. Không có thay đổi schema, env, vai trò hoặc dữ liệu thật.

Kiểm tra: build TypeScript/Vite đạt; 10 kiểm tra render đạt (biểu mẫu nhúng, ẩn danh sách/bộ lọc, màn riêng và quyền tạo). Không gọi API hoặc thao tác tài chính thật trong kiểm tra. Chưa kiểm nghiệm giao diện trên host; owner triển khai từ codex/dgc-deploy rồi thử luồng tháng 10. UI v0.6.80.
