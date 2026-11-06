# Lấy tỷ giá USD/VND từ ERP GST — nghiên cứu 06/11/2026

## Đã kiểm nguồn thật

Owner yêu cầu nghiên cứu nhập tỷ giá USD/VND từ ERP GST sang DGC, sau đó tự đăng nhập GST trong trình duyệt ChatGPT. Đã đọc bảng **Cấu hình chung → Bảng tỷ giá chung VND / USD** và JSON hiển thị tại `https://erp.gsttech.vn/api/v1/revenue-fx`. Chỉ GET, không sửa GST, không lấy tỷ giá thực thu từ receipt hoặc dữ liệu quỹ/ngân hàng.

GST có **97 kỳ từ 09/2018 đến 09/2026**. DGC tại `https://erp.digicomjsc.com/api/v1/revenue-fx` có đúng **một kỳ 01/2026**, nguồn captured/Manual. Tỷ giá kỳ này khác GST; theo quy tắc create-only đã có, phương án **giữ DGC**, không ghi đè hoặc sửa capturedRowJson. Giá trị cụ thể và toàn bộ bảng nằm trong hồ sơ private, không đưa vào Git.

Đã chuẩn bị **96 kỳ bổ sung**: 2018 bốn kỳ, 2019–2025 mỗi năm 12 kỳ, 2026 tám kỳ (02–09). Không có kỳ trùng hoặc cùng giá đã tồn tại tại mốc đọc. GST **chưa có 10/2026**; không lấp bằng tỷ giá tháng 9. Kế toán tiếp tục nhập tỷ giá tháng 10 khi có số chốt để owner thử kỳ này.

## Hành vi và phương án nhập

- Chiều đúng: **1 USD = rate VND**, giữ chuỗi số/Decimal, không đảo chiều hay lấy trung bình. Đây là tỷ giá chung theo tháng đã cấu hình, không phải tỷ giá giao dịch hoặc số VND thực nhận.
- Chỉ dùng đường cấu hình FX hiện có, `POST /api/v1/revenue-fx/import`, quyền DGC `REVENUE_FX_CREATE`, actor/CSRF/Origin theo phiên DGC. Không mở importer lịch sử/master/evidence/seed hoặc dùng quyền/approver ID của GST.
- Payload 96 kỳ là **14.359 bytes**, dưới giới hạn 32.768 bytes; batch hiện có ghi config và audit cùng transaction. Nguồn từng kỳ ghi ERP GST, domain, kỳ và nguyên văn nguồn GST. Không cần schema migration, biến môi trường hoặc thay runtime.
- Kỳ DGC đã có: cùng giá thì skip, khác giá giữ DGC và liệt kê riêng. Không tự thay 01/2026. Khi tiếp tục nhập phải đọc lại cả hai bảng, sinh lại kế hoạch để bắt kỳ/source vừa thay đổi.
- Tỷ giá dùng cho **quy đổi báo cáo** và là tỷ giá chung cho **đối soát đầu vào mới bằng VND** (`inputReconPlan` đọc `REVENUE_FX:<period>`). Không chỉ là nhãn trên Dashboard. Snapshot, tiền Invoice/revenue/AR/AP, khoản thu và ba InputRecon captured đã lưu giữ nguyên; không tính lại hoặc ghi cash.

## Chuẩn bị và kiểm thử

`scripts/dgc-gst-fx-plan.mjs` chỉ đọc hai capture private, kiểm đúng company/endpoint, kỳ/rate/source, chống trùng, giữ xung đột, bỏ approver ID, gắn provenance; xuất JSON/CSV vào thư mục private mới. Có **22 checks** cho chiều tỷ giá, Decimal, trùng/kỳ lỗi, source quá dài, tenant/endpoint, bất biến đầu vào và replay.

Đã thử payload thực qua API trên DB bản sao độc lập `dgc_migration_staging_gst_fx_20261106_synthetic`, với **tài khoản giả lập riêng chỉ có quyền FX**, không đăng nhập thay người thật. **309 checks đạt**: thêm đúng 96 config/audit, giữ nguyên config 01/2026 từng trường, giá/source chính xác, approver là actor thử DGC; CSRF sai bị chặn, replay 409, một batch có kỳ trùng hoàn tác cả config mới/audit. Fingerprint 14 nhóm bảng tài chính/tài liệu/nguồn trước sau không đổi. Không promote DB thử lên host.

## Trạng thái tiếp tục

**Đã nghiên cứu, chuẩn bị gói và thử thành công; chưa nhập tỷ giá vào DGC thật.** Host giữ v24, GST chỉ được đọc. Không tuyên bố Dashboard thật đã hết “Thiếu tỷ giá”. Lượt này chỉ đẩy công cụ/tài liệu lên nhánh source, không cần redeploy hoặc đổi nhánh generated.

Hồ sơ private `artifacts/dgc-migration/20261106/gst-fx/`: `gst-rates-response.json`, `dgc-rates-before.json` (capture đầy đủ, không publish); `import-plan.json/.csv`, `PROPOSAL.md` (bảng 96 kỳ và xung đột cụ thể); `trial-proof.json`, `trial.log`, `trial.mjs`. Gói không có mật khẩu/session/cookie. Dữ liệu từ GST và actor ID nguồn chỉ giữ private, không nhúng vào frontend/release.
