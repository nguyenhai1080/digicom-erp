# Hiện menu Thu chi khi chưa áp dụng — 07/11/2026

Owner xác nhận: chưa áp dụng quỹ/ngân hàng không có nghĩa là ẩn menu Thu chi. UI v0.6.91 hiển thị menu Quản lý Thu chi của Digicom, sau Công nợ, gồm Thu / Chi, Chuyển tiền, Sổ tài khoản, Lịch sử quỹ, Báo cáo. Tất cả tab hiển thị trạng thái Chưa thiết lập, không đưa số 0 thay số dư chưa có.

Đây là chế độ deferred của CashManagement, không kích hoạt luồng vận hành tiền. Tab không mount các component giao dịch thật, không gọi API cash/expenses/catalog/report và không mở nhập liệu/chuyển tiền. Nút tạo bị vô hiệu. Dashboard Tài khoản/Phải trả và các khoản thu lịch sử giữ nguyên. Không tạo tài khoản, quỹ, số dư đầu kỳ, giao dịch, posting hoặc tự gán quyền; không đổi env DGC_CASH_ENABLED/backend/schema.

Menu chờ thiết lập được thấy bởi người đã đăng nhập Digicom, kể cả chưa có PAYMENT_VIEW: chỉ là màn trạng thái không đọc dữ liệu, không cấp quyền cash. GST vẫn cần PAYMENT_VIEW và giữ nguyên component/API đang hoạt động. Khi owner yêu cầu áp dụng thực tế sẽ thiết lập tài khoản/quỹ, quyền và luồng vận hành riêng; không tự mở từ thay đổi này.

Giảm khoảng cách menu chỉ ở desktop <=600px để đủ 12 mục, không hiện thanh cuộn. Web build đạt và 112 browser checks dùng phản hồi GET giả lập đạt: đủ năm tab, không có API request khi người Digicom không có quyền cash mở/chuyển tab, nút thêm bị khóa; GST vẫn đọc /expenses; menu năm kích thước, tab/role/mobile/đối soát lịch sử hồi quy đạt. Đã xem ảnh trang Thu chi. Private artifacts/sidebar-layout-check/deferred-cash*. Build có cảnh báo kích thước bundle hơn 500kB (gzip ~137kB), không lỗi build.

Đã chuẩn bị gói codex/dgc-deploy, chờ owner triển khai và Ctrl+F5, UI v0.6.91; không tuyên bố đã triển khai host hoặc đã nghiệm thu thu chi.
