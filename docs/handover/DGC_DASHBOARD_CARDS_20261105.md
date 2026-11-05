# Dashboard DGC đủ bốn mục — 05/11/2026

Owner yêu cầu giữ Phải trả và Tài khoản trên Dashboard dù dữ liệu sẽ cập nhật sau. Bổ sung Phải trả USD/VND từ API /payables, đúng AP_VIEW, lấy totalsByCurrency toàn bộ kết quả (không cộng chỉ mười hàng trang đầu). Khi chưa có AP thì hiển thị Chưa cập nhật. Tài khoản hiển thị Ngân hàng (VND) và Quỹ tiền mặt (VND), đều Chưa cập nhật khi cash đang tạm hoãn; không gọi cash-balances/cash-report, tạo tài khoản hoặc số dư.

Chỉ DGC bật mục Phải trả mới; Dashboard GST giữ các mục và đường đọc cũ. Không đổi quyền người dùng. Web TypeScript/Vite build đạt. Không cần schema/API mới. Phần SOA chưa hoàn tất ở working tree phải nằm ngoài release này; đóng gói từ source HEAD sạch riêng.
