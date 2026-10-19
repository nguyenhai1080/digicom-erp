# Bắt đầu làm việc với DGC Finance

Cập nhật ngày 19/10/2026, giờ Việt Nam.

## Trạng thái sau tiếp nhận 19/10

Code đã được đưa vào repository Git riêng tại thư mục này, branch `dgc/main`, kế thừa `f97eb627`; chưa cấu hình remote hoặc triển khai. Đọc [tiến độ và khoảng trống hiện tại](docs/handover/PROGRESS_20261019.md) cùng [kế hoạch môi trường/chuyển dữ liệu](docs/handover/DGC_ENVIRONMENT_MIGRATION_PLAN.md). Phần dưới là yêu cầu bàn giao ban đầu; nhận định thư mục trống/chưa có Git không còn là trạng thái hiện tại. Ưu tiên tiếp theo là Invoice DGC, mapping quyền/tài sản ký và MZN, rồi InputRecon/AP/SOA trước staging.

Đọc [tài liệu bàn giao](docs/handover/HANDOVER.md) trước khi sửa code, nhập dữ liệu hoặc triển khai. Project Codex DGC-ERP hiện trỏ tới `D:/Projects/DGC-ERP`; thư mục này còn trống trước khi lưu tài liệu và chưa có Git ứng dụng.

Mục tiêu là đưa DGC Finance lên Vibehost ở tài khoản cũ, tên miền `erp.digicomjsc.com`, dùng code phát triển từ ERP Core và chuyển dữ liệu từ `DGC_ERP_2026_PROD_RC1_CLONE`. GST đã chuyển sang tài khoản mới; không sửa code hoặc dữ liệu sản xuất GST để làm DGC.

## Yêu cầu đầu tiên cho phiên Codex tiếp theo

> Đọc START_HERE.md và docs/handover/HANDOVER.md. Phân biệt code ERP Core dự kiến dùng cho DGC với Apps Script hiện hành. Kiểm tra nhánh feature/dgc-finance tại D:/Projects/DGC-FINANCE-WEB, so sánh với nền GST ổn định và đọc baseline nghiệp vụ DGC. Chuẩn bị code và repository DGC riêng trong project này; trước khi triển khai phải có kế hoạch môi trường DGC độc lập và rà soát tính năng còn thiếu. Chuyển dữ liệu phải thử trên staging, giữ nguồn gốc và đối soát trước khi đưa vào sử dụng.

Các việc tạo repository, giải phóng host cũ, triển khai DGC và nhập dữ liệu chưa hoàn tất. Tài liệu bàn giao không thay thế bước kiểm tra này. Không đưa `.env`, token, bản sao dữ liệu thật hoặc kho PDF lên Git.
