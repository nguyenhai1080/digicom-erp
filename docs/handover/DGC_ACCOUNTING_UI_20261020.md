# Kiểm tra UI kế toán — 20/10/2026

Tiếp nối [quyền và luồng chuẩn bị đối soát](DGC_ACCOUNTING_PREPARATION_20261020.md). Chạy giao diện build thật với API/auth/CSRF và PostgreSQL riêng, chỉ dùng dữ liệu giả lập. Không gọi donor hoặc môi trường DGC/GST thật.

## Sửa lỗi tìm thấy

- Bấm kỳ thiếu tỷ giá trước đây chỉ chọn kỳ trong form đang đóng. Nay mở form và điền kỳ ngay.
- Sửa kỳ, số tỷ giá hoặc nguồn trước đây giữ nguyên dấu xác nhận. Nay bỏ xác nhận, khóa nút lưu đến khi người dùng kiểm tra và tích lại. Chọn kỳ thiếu cũng bỏ xác nhận cũ.

## Kết quả quan sát trực tiếp

- Đăng nhập tài khoản ACCOUNTING_FIXTURE: có đối soát đầu vào/đầu ra và tỷ giá; không có quản trị vai trò, cấu hình chung hoặc quản lý thu chi.
- Chọn kỳ đầu vào 2026-04 thiếu tỷ giá, mở phần tỷ giá, bấm 2026-04: form mở và kỳ đúng. Đã thử riêng thay số tỷ giá, nguồn và kỳ sau khi tích; cả ba đều bỏ xác nhận và khóa lưu.
- Lưu tỷ giá 25010, nguồn Synthetic browser verification. UI báo thành công; bảng tỷ giá hiển thị số mới, nguồn đầu vào tự tải lại, giữ kỳ 2026-04 và hiện nút tạo nháp.
- Preview nguồn: cơ sở 90 USD, chia 40% = 36 USD, nội tệ 900360 VND, thuế khấu trừ 90036 VND, phải trả 810324 VND. Tạo được IR-0002 trạng thái Nháp, không có thao tác duyệt cuối cho kế toán.
- Mở Biên bản: bảng preview/tổng phải trả đúng 810324 VND, có bước tạo PDF xem trước. Đợt này chưa tạo/lưu PDF bằng browser; kiểm PDF tích hợp ở đợt trước vẫn là bằng chứng riêng.
- Màn đầu ra có upload PDF và phần tỷ giá dùng chung, đọc được tỷ giá vừa lưu. Fixture không có PDF đầu ra đang mở, nên chưa kiểm trực quan việc giữ PDF khi nhập tỷ giá.
- Tìm tỷ giá năm 2025 có 12 kỳ: trang 1 có 10 dòng, trang 2 có 2 dòng, tổng/trang và khóa nút trước/sau đúng.

Đối chiếu DB sau browser: REVENUE_FX:2026-04 = 25010; audit REPORTING_FX_CREATE và INPUT_RECON_GENERATE thuộc accounting@example.test. IR-0002 DRAFT, base 90, payable 810324; doanh thu REV-0003 vẫn USD gross 100/net 90. Toàn DB fixture có 0 AP và 0 cash entries.

Ảnh bằng chứng riêng, Git ignored: `artifacts/dgc-ui/20261020/accounting-input-draft.png`.

## Fixture và kiểm chứng

`apps/api/tests/accounting-ui.fixture.mjs` chỉ chạy khi DGC_UI_FIXTURE=true, DB có tiền tố erp_execution_acceptance_dgc_roles_ui_ và công ty tên Synthetic DGC roles. Chuẩn bị DB mới bằng schema hiện tại và suite dgc-role-access.integration.mjs (223 assertions đạt trong DB UI này), rồi chạy fixture setup một lần. Fixture tạo nguồn tháng 4, profile giả và 12 tỷ giá năm 2025; yêu cầu mật khẩu giả qua env dài ít nhất 12 ký tự. Mode serve bỏ bước setup để giữ dữ liệu/session khi kiểm lại bundle. Không dùng mật khẩu thật.

Server phục vụ web dist tại /fixture/ và API cùng origin; Docker chỉ publish 127.0.0.1:3901. Script nằm trong tests, không được nối vào startup/deploy. Web build Node 22/pnpm 10 sau sửa đạt; git diff --check đạt. Không chạy lại các suite không bị thay đổi chỉ để tăng số kiểm tra.

Chưa nghiệm thu toàn bộ UI/role parity, OCR thật, timezone hoặc SOA cutoff; chưa gán quyền người dùng thật, nhập tài chính thật hoặc deploy.
