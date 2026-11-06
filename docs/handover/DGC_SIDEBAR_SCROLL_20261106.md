# Menu cuộn theo chiều cao màn hình — 06/11/2026

Owner báo các mục SOA, tỷ giá, cấu hình và người dùng tràn khỏi nền sidebar. Sidebar có chiều cao 100dvh nhưng nav không được co và cuộn, khiến nội dung tràn ra ngoài.

UI v0.6.81: nav dùng phần chiều cao còn lại, min-height 0 và cuộn dọc riêng; branding/footer không co, sidebar có cuộn dự phòng. Màn nhỏ giữ menu dạng hàng xuống dòng, giới hạn vùng cuộn 50dvh. Không thay mục menu, quyền, API hoặc dữ liệu. Bao gồm phần tạo Invoice ngay dưới đối soát của v0.6.80.

Kiểm tra layout bằng Edge headless trên fixture dùng CSS thật và đủ 16 mục menu: 1366×768, 960×540, 720×480, 390×844. Mục Người dùng đạt tới được bằng focus bàn phím, mọi mục nằm trong nền sidebar, không tràn ngang; desktop sidebar đứng yên khi cuộn trang. Đã xem ảnh desktop cuộn cuối; TypeScript/Vite build đạt. Bằng chứng private artifacts/sidebar-layout-check. Chưa kiểm trên host; owner triển khai nhánh codex/dgc-deploy rồi tải lại trang.
