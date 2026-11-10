# Đối soát đầu vào theo hợp đồng — v0.6.93

## Kết quả

Owner yêu cầu hoàn thiện luồng cho dịch vụ có hợp đồng đầu vào, kèm hai PDF tháng 10/2026. Đã đọc chữ và xem bản render của cả hai; dùng làm tham khảo cách nhóm dịch vụ theo hợp đồng/đối tác và bố cục biên bản. Không nhập số tiền, sao chép chữ ký số, sửa hợp đồng hay tự lập/duyệt hồ sơ thật từ các PDF này. Các bản gốc và bản render nằm ngoài Git.

Tab **Quản lý đối soát → Đối soát đầu vào** bổ sung:

- Bộ lọc kỳ/hợp đồng, hiển thị mã đối tác và số hợp đồng. Nguồn chỉ liệt kê dịch vụ có liên kết ContractService với hợp đồng Input; vẫn báo rõ hợp đồng không hiệu lực, nhiều hợp đồng hoặc thiếu FX. Chọn hợp đồng cũ không được âm thầm chuyển sang hợp đồng khác đang hiệu lực.
- Chọn nhiều nguồn qua các trang (10 dòng/trang), tối đa 100. Thay kỳ/hợp đồng xóa lựa chọn. Xem trước đầy đủ cơ sở, tỷ lệ, FX, thuế và phải trả trước khi xác nhận tạo nháp.
- Tạo cả nhóm trong một transaction, cùng kỳ/hợp đồng Input/đối tác đầu ra; kiểm lại toàn bộ nguồn sau khóa kỳ/công ty. Lỗi giữa chừng rollback toàn nhóm. Replay giữ bản đã có, không refresh hoặc đổi trạng thái của nó; snapshot cũ phải nguyên vẹn.
- Sau khi tạo chuyển sang danh sách đã tạo để mở Biên bản. Sửa lỗi chuyển tab từng gây đọc nhầm hình dạng dữ liệu và trắng màn hình; bấm lại tab đang chọn vẫn giữ danh sách.
- PDF native có tên dịch vụ/mạng, nhãn hai bên Digicom/đối tác, ngày dd/mm/yyyy, tỷ lệ không bị làm tròn thành phần trăm nguyên, FX giữ độ chính xác lưu. Header tự giãn theo nhãn, lặp khi phân trang. Nếu có thuế khấu trừ, ghi rõ khoản phải trả đã khấu trừ và cột Digicom là phần còn lại gồm khấu trừ.

## Giữ nguyên nghiệp vụ

Đã đọc implementation donor v61 `53_InputRecon_AP.js` phần generate/index/statement. Không đổi công thức `round2(baseUSD × share)` trước FX, thuế khấu trừ, WHT=0, hoặc cách làm tròn từng dòng VND của PDF. Không suy công thức hay phần thập phân ẩn từ số in trên hai PDF mẫu. Số liệu mới dùng nguồn đầu ra đã chốt và cấu hình đúng kỳ, không lấy kỳ trước thay FX.

Tạo nháp/PDF chưa tạo AP. Duyệt từng dòng theo `INPUT_RECON_APPROVE` mới tạo AP, cùng cơ chế atomic/idempotent đã có. Không kích hoạt quỹ/ngân hàng, không tạo tài khoản/số dư/chi tiền. Không thay role/env/schema/importer, không sửa GST. Nghiệp vụ ký số bên ngoài, nộp bản ký và thanh toán AP không được mở rộng trong đợt này.

Hồ sơ captured vẫn dùng bản in tra cứu riêng, giữ nguyên tiền/trạng thái/snapshot và cấm refresh. Không duyệt ba Generated lịch sử để làm thử. Owner tiếp tục tự nhập/chốt October trên sổ thật.

## API

- GET `/api/v1/input-recon/contracts`: danh mục tối thiểu trong tenant DGC, `INPUT_RECON_VIEW`; không cấp thêm CONTRACT_VIEW/SYSTEM_CONFIG_EDIT.
- GET sources/list thêm `inputContractId`, giữ 10 dòng/trang.
- POST `/batch-preview`, `/batch-generate`: `INPUT_RECON_GENERATE`, Origin/CSRF, UUID unique/1–100 nguồn, digest/xác nhận và tenant DGC. Không trả thành công trước khi transaction commit.
- Các endpoint đơn lẻ, biên bản, captured, duyệt/AP hiện có tiếp tục dùng nguyên cơ chế quyền và bảo toàn nguồn.

## Kiểm chứng

- API/web build đạt. 17 kiểm tra công thức donor; PDF Unicode, phân trang A4 ngang, overflow và captured exact-value đạt; xem PNG bản in native cuối, cùng màn hình desktop/compact.
- 286 API assertions Windows; bản cuối 288 assertions Linux, giới hạn 0.3 CPU/512 MB/192 MB heap, DB synthetic mới riêng. Bao gồm stale FX, thiếu đúng kỳ, hợp đồng khác/cũ, thiếu quyền/CSRF/Origin, tenant khác, rollback khi lỗi audit giữa nhóm, tạo đồng thời/replay, PDF và không phát sinh AP/cash khi tạo nháp.
- 20 browser assertions với API giả lập: chọn qua trang, lọc hợp đồng, bước xác nhận, chuyển tab và bấm lại tab, chỉ xem, thiếu FX, xem PDF trước lưu, bố cục compact; không duyệt AP/chi tiền thật.
- Bằng chứng riêng: `artifacts/input-recon-20261110/`, kịch bản browser trong `artifacts/sidebar-layout-check/input-contract-workflow.mjs`. Không đưa tài liệu nguồn hoặc dữ liệu thật vào release.

## Triển khai và nghiệm thu

Phát hành source `dgc/main` và gói một website `codex/dgc-deploy`, v0.6.93. Chờ owner triển khai lại trên website Digicom hiện tại; không cần DB/env mới. Online v0.6.92 đã xác nhận trước đó không phải bằng chứng v0.6.93 đã triển khai.

Sau triển khai: owner chọn kỳ 10/2026/hợp đồng, kiểm nguồn và FX thật, tạo nháp/PDF, xác nhận với đối tác rồi duyệt khi phù hợp. Không tuyên bố đã nghiệm thu tài chính từ các kiểm thử synthetic. Hướng dẫn: [DGC_INPUT_RECON_GUIDE.md](../DGC_INPUT_RECON_GUIDE.md).
