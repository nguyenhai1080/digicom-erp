# Dashboard DGC đủ bốn mục — 05/11/2026

Owner yêu cầu giữ Phải trả và Tài khoản trên Dashboard dù dữ liệu sẽ cập nhật sau. Bổ sung Phải trả USD/VND từ API /payables, đúng AP_VIEW, lấy totalsByCurrency toàn bộ kết quả (không cộng chỉ mười hàng trang đầu). Khi chưa có AP thì hiển thị Chưa cập nhật. Tài khoản hiển thị Ngân hàng (VND) và Quỹ tiền mặt (VND), đều Chưa cập nhật khi cash đang tạm hoãn; không gọi cash-balances/cash-report, tạo tài khoản hoặc số dư.

Chỉ DGC bật mục Phải trả mới; Dashboard GST giữ các mục và đường đọc cũ. Không đổi quyền người dùng. Web TypeScript/Vite build đạt. Không cần schema/API mới. Phần SOA chưa hoàn tất ở working tree phải nằm ngoài release này; đóng gói từ source HEAD sạch riêng.

V22 đã trực tuyến từ release 4aeacda598073fbc54657a48994cc4e8fd679c4c (source e3b4d5e2a324596dd6addf130ae1d863203501e1). Đóng gói từ worktree HEAD sạch: kiểm toàn bộ API/schema/assets khớp release ổn định trước; không có migration/model SOA mới hoặc donor records. Docker build đạt.

Đã kiểm Dashboard trên cùng host/DB DGC qua phiên đọc sẵn có ở URL tinhgon: đủ Doanh thu, Phải thu, Phải trả, Tài khoản; hai mục mới hiện Chưa cập nhật. Doanh thu USD 757389.25, phải thu USD 25328.54 không đổi; chỉ đọc, không tạo AP/tài khoản/số dư. Website chính thức vẫn https://erp.digicomjsc.com/ (APP_URL giữ nguyên), không chuyển lại nguồn đăng nhập. Proof riêng: artifacts/dgc-migration/20261105/dashboard-four-cards.png và dashboard-four-cards-state.txt. Không gọi đây là nghiệm thu nghiệp vụ quỹ/ngân hàng.
