# DGC Finance

Ứng dụng DGC độc lập, kế thừa ERP Core tại `f97eb627ad102e73eb57373d098b0ea162965665`. Đọc [START_HERE](START_HERE.md), [bàn giao](docs/handover/HANDOVER.md) và [trạng thái tiếp nhận](docs/handover/PROGRESS_20261019.md) trước khi làm tiếp. Chưa nghiệm thu tương đương nghiệp vụ, chưa triển khai hoặc nhập dữ liệu DGC.

## Phát triển địa phương

Dùng Node 22 và pnpm 10.18.3: `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`. Generate/build không cần kết nối database. Các suite tài chính tích hợp chỉ được chạy với database dùng thử đúng tiền tố mà từng suite yêu cầu.

`docker compose -f docker-compose.dev.yml up -d` tạo PostgreSQL trong project **dgc-finance-dev**, database `dgc_finance_dev`, volume riêng và cổng loopback **55432**. Sao chép `.env.example` sang `.env`, cung cấp tên pháp nhân DGC đã xác nhận. Seed chạy thủ công một lần trên DB DGC trống sau migration. Prisma CLI/seed cần được truyền biến từ `.env` rõ ràng; không giả định CLI tự đọc `.env` tại root từ workspace con.

## Triển khai

Xem [kế hoạch môi trường và chuyển dữ liệu](docs/handover/DGC_ENVIRONMENT_MIGRATION_PLAN.md). Chưa có remote hoặc dịch vụ DGC được cấp. Vibehost kiểm tra ngày 19/10 đang là tài khoản GST Vietnam; phải kết nối tài khoản DGC cũ trước khi triển khai.

Tài liệu gốc được giữ tại [README upstream](docs/ERP_CORE_UPSTREAM_README.md) để tra cứu kỹ thuật. Các chỉ dẫn deploy vào `develop`, seed và dùng host sẵn có trong tài liệu upstream không phải hướng dẫn vận hành DGC.
