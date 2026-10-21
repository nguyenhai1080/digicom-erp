# InputRecon/AP DGC — cập nhật 20/10/2026

Tiếp tục từ DGC_MIGRATION_AND_INVOICE_20261019.md. Đã triển khai runtime và kiểm thử trên dữ liệu tổng hợp; chưa nhập financial record thật, chưa triển khai production và chưa nghiệm thu tương đương toàn bộ DGC. Snapshot thật/staging cũ vẫn giữ 3.154 raw rows, 37 mapping danh mục, không phát sinh số liệu tài chính vận hành từ đợt này.

## Nguồn và hành vi đã kế thừa

Đã đọc donor v61 `53_InputRecon_AP.js`: generate 99–250, pending 252–322, matching hợp đồng 324–375, approve/AP 377–444, chọn cơ sở USD 450–576 và PDF 697–1031. Luồng generate hiện hành dùng hợp đồng Input, không dùng bảng rule 3rd-party để tính.

- Nguồn là doanh thu đầu ra đã duyệt và còn hiệu lực, kể cả doanh thu đã chuyển sang Invoiced/Paid mà số tiền không đổi. Mỗi nguồn phải có đúng một hợp đồng/liên kết dịch vụ Input Active, trùng kỳ hiệu lực. Tỷ lệ liên kết ưu tiên; nếu bằng 0 thì lấy tỷ lệ header theo donor. Không đoán dịch vụ hoặc tự lấy hợp đồng đầu tiên khi nhiều ứng viên.
- Cơ sở là Invoice_Payable_USD đã kiểm tra. Nguồn PDF phải khớp upload, approved snapshot, binding, checksum file gốc và signed PDF hiện hành. Nguồn nhập tay dùng approved payload; native VND được quy ra cơ sở USD bằng tỷ giá đã nằm trong payload được duyệt, không lấy tỷ giá báo cáo mới để sửa nguồn lịch sử.
- Thứ tự: `foreign = round2(base USD × share)` → `local = round2(foreign × FX)` → `tax = round2(local × contract tax)` → `WHT = 0` → `payable = round2(local − tax − WHT)`. Thuế là khấu trừ như donor. USD dùng FX = 1; Input VND dùng tỷ giá chung USD/VND đúng kỳ đã xác nhận trong cấu hình. MZN không phải tiền tệ vận hành.
- Generate chỉ tạo Draft, không tạo AP/Invoice/cash entry. Approve tạo đúng một AP và chuyển Approved trong cùng transaction/audit. AP không có ngày Invoice/hạn thanh toán theo donor; không suy ra số ngày quá hạn.
- PDF gộp đúng một hợp đồng Input/kỳ/đối tác, mặc định gồm cả Approved. Nhóm dịch vụ giữ tổng cơ sở, doanh thu hợp tác, tỷ lệ và số hưởng hai bên. Khác tỷ giá/tiền tệ trong nhóm, hoặc khác tỷ lệ cùng dịch vụ, bị chặn để tránh hiển thị một tỷ lệ không đúng.
- PDF VND làm tròn từng dòng số hưởng tới số nguyên rồi cộng, như donor; AP giữ số tính tới hai chữ số thập phân. Ví dụ fixture: 123.45 USD × 40% = 49.38 USD; FX 25001 → 1,234,549.38 VND; thuế 10% = 123,454.94; AP = 1,111,094.44. PDF hiển thị đối tác 1,111,094 VND. Không lấy số đã in làm cơ sở tính lại AP.

## Những thích ứng được ghi rõ

- Các Decimal được đối chiếu bằng fixture trước khi dùng. Từ chối tỷ lệ vượt 0–1, giá trị thiếu/âm hoặc payable làm tròn về 0; donor có thể tiếp tục với số 0 khi không tìm thấy cơ sở. Không port fallback chọn hàng MZN đầu tiên không rõ danh tính vào runtime. Legacy importer sẽ phải giữ số tiền nguồn, không chạy lại generator này.
- Chỉ nhận liên kết ContractService tường minh và còn hiệu lực. Không tách chuỗi Service_ID header thành liên kết ngầm. Unique `(companyId, sourceRevenueId)` chặn một nguồn bị chia nghĩa vụ hai lần khi đổi hợp đồng; donor dedupe theo bốn khóa và có thể bỏ lọt trường hợp đổi hợp đồng. Draft bị stale có thao tác **xem lại rồi refresh** với audit, không tự tính lại bản Approved.
- PDF dựng bằng pdf-lib, font Noto Sans tiếng Việt, A4 landscape, ngắt trang và lặp tiêu đề. Dùng tên pháp nhân đã xác nhận trong cấu hình Invoice; không hardcode tên GST hoặc DIGICOM. Hiển thị đúng tiền tệ USD/VND, tên mạng từ đối tác nguồn; không giả rằng mọi đối tác là Movitel. Không tự ký PDF đầu vào.
- Không có thao tác hủy/xóa AP đã duyệt hoặc trả tiền AP trong đợt này. Các lệnh thu/chi thật vẫn thuộc Quản lý Thu chi và cần kế hoạch cash ledger sau lịch sử theo yêu cầu owner. Không tạo tài khoản ngân hàng hoặc số dư giả.

## API, UI và integrity

Các quyền mới: INPUT_RECON_VIEW, INPUT_RECON_GENERATE (capability Manager/BOD), INPUT_RECON_APPROVE (capability BOD). AP_VIEW giữ quyền xem sổ phải trả. Seed khai báo quyền và cấp ADMIN; chưa seed/gán role cho user thật. Mapping đầy đủ Staff/Manager/BOD vẫn cần hoàn tất.

- `/api/v1/input-recon/sources`, `/input-recon`: danh sách 10 dòng/trang, có period/page, tổng và nguồn chưa sẵn sàng với lý do.
- POST `/input-recon/preview`, `/generate`: preview/digest và tạo idempotent, company/period lock. Mọi POST kiểm Origin/CSRF và quyền action.
- POST `/input-recon/:id/refresh`, `/:id/approve`: expectedUpdatedAt, xác nhận cụ thể; kiểm lại nguồn/tỷ lệ/FX, snapshot checksum và số tiền. Duyệt lại bản Approved chỉ xác nhận AP có sẵn, không ghi đè khoản đã trả.
- POST `/input-recon/statement-preview`, `/statement-pdf-preview`, `/statement-create`; GET `/:id/pdf`. Preview chưa lưu file; create ghi file/document + status Generated + audit cùng transaction và rollback file khi lỗi. PDF mới không sửa trạng thái Approved/AP. Giữ phiên bản PDF cũ.
- `/api/v1/payables`: số ban đầu/đã trả/còn phải trả và tổng riêng từng tiền tệ, 10 dòng/trang. Hiện chưa có endpoint ghi payment AP.
- Preflight thay nguồn đối soát đầu ra chặn khi doanh thu đã có InputRecon/AP, kể cả Draft; không làm mất nguồn đã được dùng. Sửa vị trí signed PDF đầu ra vẫn giữ cùng nguồn/số tiền, không làm phát sinh AP lần hai.
- Migration additive `20261020001000_dgc_input_recon_ap`: hai bảng InputReconciliation/AccountPayable, FK ghép company với nguồn/dịch vụ/hợp đồng/đối tác/document; unique idempotency và checks số tiền/trạng thái. Migration đã áp dụng trên DB fixture riêng, chưa áp dụng vào staging chứa snapshot thật.

## Kiểm chứng

- Workspace build Node 22/pnpm 10.18.3 và Prisma generate đạt.
- **17** kiểm tra thứ tự tính/miền giá trị; characterization PDF tiếng Việt, landscape, nhiều trang, overflow và số tiền bằng chữ đạt.
- **187** assertions InputRecon/AP: hợp đồng/FX/thời hạn/đa ứng viên, quyền/tenant/CSRF, snapshot JSONB, chạy đồng thời và replay, nguồn đổi/refresh, PDF history/rollback, approve/AP rollback, USD/VND và phân trang 11 dòng. Không tạo Invoice/AR/cash account/cash entry.
- **100** assertions DGC recon mở rộng, gồm PDF đã chốt → InputRecon → AP USD, sau đó restamp giữ nguyên digest tài chính/AP.
- **264** hồi quy đối soát–Invoice–AR/payment GST đạt trên schema mới. DB fixture/container riêng, source checkout mount chỉ đọc. Raw source, ảnh ký, snapshot thật không làm fixture.
- Poppler đã render/xem bản một trang và ba trang; bảng, tiếng Việt, tổng/ghi chú/khu vực đại diện không cắt/chồng nội dung. Proof và pdftotext private tại `artifacts/dgc-migration/20261020/proofs/input-recon/`.
- Đã thao tác browser localhost bằng tài khoản fixture: lọc nguồn tháng 4 → xem cơ sở → tạo Draft → duyệt AP 36 USD → kiểm sổ AP; tháng 3 có 11 dòng, trang 1/2 và 2/2 giữ tổng 396 USD. Đã đăng xuất và dừng server test. Ảnh bằng chứng `browser-payable.png` chỉ chứa dữ liệu tổng hợp. Chưa nghiệm thu ảnh/pháp nhân/ngân hàng thật.

## Phần đang tiếp tục

Đã bổ sung [chuẩn bị migration InputRecon/AP lịch sử ngày 21/10](DGC_INPUT_FINANCE_MIGRATION_20261021.md): ba bản Generated/0 AP, kiểm số đã capture và lưu PDF chung theo row/hash. Một chênh lệch 0,5 VND giữ nguyên; ba số phải trả đều khớp PDF. Không dùng generator/approve runtime ở trên để nhập lại hoặc duyệt các hàng này. Importer/rehearsal tài chính vẫn chưa hoàn tất.

SOA: đã đọc donor `52_StateOfAccount.js`, đặc biệt DGC_buildSoaData_ 353–452. Donor lọc Invoice_Date theo asOfDate nhưng DGC_sumPaymentsForInvoice_ không nhận cutoff; đây là điểm đã ghi trong baseline cần owner xác nhận. Câu hỏi đang chờ: Invoice 100 USD ngày 10/01, thu 60 USD ngày 05/02 thì SOA tại 31/01 còn 100 USD hay 40 USD. Chưa mặc định chọn một cách tính. Đã thêm [bảng đối chiếu chỉ đọc hai chính sách](DGC_SOA_CUTOFF_REVIEW_20261020.md), chưa phát hành SOA.

Trong khi chờ, tiếp tục kiểm kê/resolver chuỗi dữ liệu lịch sử, không nhập financial records khi quan hệ/phiên bản còn mơ hồ. Vẫn cần SOA, Invoice cancel/regeneration và các guard liên quan, full role mapping, importer financial/file, đối soát cuối kỳ và cutover trên tài khoản DGC đúng. Không push remote/deploy hoặc thay nguồn Google Sheet trong đợt này.

Đã có [báo cáo reference review](DGC_REFERENCE_REVIEW_20261020.md): resolver giữ mọi hàng trùng, 19 liên kết được phân biệt theo ngữ cảnh; còn 63 liên kết thiếu/mâu thuẫn/chưa rõ trên phạm vi mở rộng. Không nhập financial record.

Đã bổ sung [hủy Invoice chưa thanh toán](DGC_INVOICE_CANCEL_20261020.md) và lập lại từ nguồn, giữ lịch sử/AR cũ. SOA vẫn chờ cutoff; không xem guard tham chiếu SOA/package là runtime hoàn chỉnh.
