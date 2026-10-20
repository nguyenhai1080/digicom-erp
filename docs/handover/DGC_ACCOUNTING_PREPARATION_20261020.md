# Kế toán nhập tỷ giá và chuẩn bị đối soát — 20/10/2026

Owner chỉ đạo: “nhập tỷ giá thì để cho nhân viên kế toán nhập là được rồi, tiện làm đối soát đầu vào đầu ra luôn”. Quyết định này thay giới hạn tỷ giá chỉ Manager/BOD trong mapping donor trước đó.

## Thực hiện

Thêm mẫu vai trò **DGC_ACCOUNTANT — Nhân viên kế toán**, kế thừa tập quyền Staff hiện có và bổ sung:

| Công việc | Quyền |
| --- | --- |
| Nhập tỷ giá chung theo kỳ, đơn lẻ hoặc hàng loạt | REVENUE_FX_CREATE |
| Nhận/đọc PDF đối soát đầu ra | RECON_VIEW, RECON_UPLOAD (đã có trong Staff) |
| Kiểm tra/sửa số liệu nháp đầu ra | RECON_REVIEW |
| Xem nguồn, kiểm tra cơ sở và tạo/cập nhật nháp/PDF đầu vào | INPUT_RECON_VIEW, INPUT_RECON_GENERATE |

Không thêm quyền duyệt cuối RECON_APPROVE, INPUT_RECON_APPROVE, duyệt doanh thu, restamp, cấu hình ký, tài khoản/quỹ hoặc cash posting. Manager/BOD giữ quyền hiện có. Staff thông thường không tự nhận các quyền bổ sung của kế toán.

Đây là role target theo chỉ đạo owner, không giả định Apps Script có donorRole Accountant. Metadata dùng donorRole=null, inheritsDonorRole=Staff và ownerInstruction riêng; giữ proposalOnly/fullParity=false cho phạm vi nghiệp vụ chưa nghiệm thu. Có thể chọn mẫu Kế toán trong quản trị vai trò; chọn mẫu chưa tạo/gán tài khoản. Chưa cấp quyền cho người dùng thật hoặc chạy seed staging. Không thêm permission code/schema migration mới.

## Thuận tiện khi làm đối soát

Ở cả màn hình đầu vào và đầu ra DGC có phần mở rộng **Tỷ giá dùng cho đối soát đầu vào / đầu ra**, dùng chung ReportingRates và action flag từ API. Kế toán nhập tại chỗ, không phải mở cấu hình chung hoặc rời màn hình. Bảng giữ phân trang 10 dòng.

Lưu tỷ giá thành công sẽ làm InputRecon tải lại dữ liệu, giữ kỳ/tab/trang đang chọn và bỏ preview/xác nhận cũ để kiểm tra lại theo tỷ giá mới. Không remount OutputRecon nên không đóng bản PDF đang kiểm tra. Không thêm logic sửa/ghi đè kỳ tỷ giá đã tồn tại, không tính lại tiền lịch sử hoặc đổi phép tính đối soát.

## Kiểm chứng

- Build toàn workspace Node 22/pnpm 10 đạt.
- Role/manual/FX/receipt/accounting integration **223 assertions đạt**: bốn mẫu role, kế toán nhập cả hai API tỷ giá, actor audit đúng, preview/tạo nháp InputRecon với rate mới, AP chưa phát sinh; chặn duyệt đầu vào/đầu ra, cấu hình ký và cash; giữ Staff thường/GST và các guard hiện có.
- DGC output/source/PDF integration **105 assertions đạt**, thêm actor kế toán thật trong fixture: upload được, sửa số OCR nháp được và audit đúng actor; signed-preview/finalize bị chặn. Actor có quyền duyệt vẫn hoàn tất luồng, giữ file gốc, all-page composite, AP và restamp guards.
- Financial characterization **85** đạt. Các con số chỉ là assertions fixture, không phải nghiệm thu toàn bộ nghiệp vụ hoặc migration.
- Chưa kiểm browser thao tác phần tỷ giá mới. Source extraction trong suite PDF được freeze bằng fixture đã characterization; không tuyên bố chạy lại toàn bộ OCR thật cho kế toán.

Chưa deploy/push, nhập financial records thật, đổi quyền người dùng thật, SOA cutoff, timezone, snapshot hoặc các proposal liên kết lịch sử đang chờ owner.
