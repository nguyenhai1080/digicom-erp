# Tên miền chính thức DGC — 05/11/2026

Owner đã khai báo https://erp.digicomjsc.com/ và yêu cầu sửa lỗi “Nguồn yêu cầu không hợp lệ” khi đăng nhập. Auth runtime so sánh Origin chính xác với new URL(APP_URL).origin; không cần nới guard hoặc thêm wildcard.

Đã sửa duy nhất APP_URL của Digicom-Erp (project cmvkgp9h30auw0i5fuqpsqez2) từ tên miền tinhgon sang https://erp.digicomjsc.com, lưu và redeploy thành công v21. Deployment branch vẫn c571438e6e9f5b854c7241b07a0117618f482b11. Không push/release mã SOA đang làm; không đổi secrets, roles, tài khoản, importers hoặc dữ liệu tài chính. Connector hiện vẫn tài khoản GST, nên thao tác qua browser đúng tài khoản DGC.

Kiểm API lúc 12:05 giờ Việt Nam: POST login với body rỗng từ origin chính thức trả 400 kiểm tra thông tin (đã qua origin guard); origin lạ và thiếu Origin đều trả 403. Health 200. Không gửi mật khẩu, không tạo phiên đăng nhập hoặc đổi lastLogin của ai. Trang đăng nhập tên miền chính thức mở được, dịch vụ hoạt động; đăng nhập bằng tài khoản thực do người dùng thực hiện. Cookie theo host nên cần đăng nhập lại ở tên miền chính thức; link tinhgon cũ không còn là nguồn hợp lệ cho thao tác ghi.

Proof riêng: artifacts/dgc-migration/20261105/domain/origin-check.json, host-v21-domain.png, official-login.png. Không gửi thông báo/email cho nhân viên.

Tiếp tục [roadmap hiện tại](../DGC_ROADMAP.md); phần SOA còn ở working tree theo [bàn giao phát triển](DGC_SOA_CONTINUATION_20261105.md), chưa đủ test/UI để deploy. Không gộp mã này vào bất kỳ release cấu hình tên miền nào.
