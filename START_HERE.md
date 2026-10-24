# Bắt đầu làm việc với DGC Finance

Cập nhật ngày 24/10/2026, giờ Việt Nam.

**Invoice scan và USD đã in trên Invoice:** [bàn giao 24/10](docs/handover/DGC_NATIVE_INVOICE_USD_20261024.md) thêm profile riêng cho hàng 84: original Invoice in đủ ba USD components; Recon native và captured FX replay khớp, không đánh dấu FX/Revenue/WHT USD là đã in trên Recon. Trial clone host một Invoice–AR/revenue/scope đạt 41 assertions, replay/rollback sạch, giữ 37 master links; bốn native scans khác vẫn held. Extension đã trial cùng transaction 18 Invoice–AR / 114 revenue / 12 documents-links / 13 receipts, đạt 319 assertions và 39 suites; giữ nguyên strict/V1–V4 và mọi financial import/acceptance gates. Còn 33 Invoice dependencies giữ 34 referenced documents, 38 receipts ngoài set; hai Issued hàng 85/86 còn evidence holds. Host v14 không đổi.

**Invoice lịch sử nhiều kỳ:** [bàn giao 24/10](docs/handover/DGC_MULTIPERIOD_INVOICE_20261024.md) đã nối hàng 85 thành ba scope 03–05/2019, giữ kỳ header 05/2019. Một Invoice–AR / ba revenue / ba scopes đã thử ghi/đọc/replay/rollback trên clone host, giữ 37 master links; 59 unit, 31 source, 63 synthetic và 45 source PostgreSQL đạt. Projection riêng giải thích false reservations/status, không sửa các plan/gate cũ. Còn bằng chứng PDF revenue; chưa financial commit, chưa thêm vào unified 17 hoặc cutover. Host v14 không đổi.

**Kho nguồn đã chuyển lên DGC thật:** [host transfer 24/10](docs/handover/DGC_EVIDENCE_HOST_TRANSFER_20261024.md) đã preview/rollback rồi apply 3.154 hàng / 25 bảng; đọc đủ 91 Invoice trên 10 trang và tìm kiếm. Backup trước/sau thành công; dump host restore local đạt 34 assertions, full payload replay khớp, 37 master links và 0 financial records. V14 đã online, runtime transferEnabled=false; preview bị chặn và reader vẫn đọc đủ. Chưa đạt cutover 23/10; tiếp tục operational financial import, files/registry và UAT.

**Đã chuẩn bị chuyển kho nguồn:** [evidence transfer](docs/handover/DGC_EVIDENCE_TRANSFER_20261023.md) có preview/rollback, apply/replay và màn đọc Invoice nguồn phân trang 10. 49 source/63 HTTP/17 unit + 36 suites đạt, browser local đạt. Gói private 3.154 hàng/25 bảng, kiểm 37 master links, không tạo financial records. Chưa apply host; tiếp tục triển khai/backup/chuyển rồi tắt importer. Không coi đây là cutover.

**Đã chạy một transaction tài chính chung:** [unified staging](docs/handover/DGC_UNIFIED_FINANCIAL_STAGING_20261023.md) ghi/đọc thử 17 Invoice–AR, 113 revenue, 12 documents/12 links và 13 receipts trên parent đầy đủ (không shells). Replay/rollback sạch, 37 master links không đổi; 310 source/173 synthetic + 35 suites đạt. Còn 38 receipts ngoài set, 34 Invoice dependencies/34 referenced documents và ba Issued held; đã phát hiện Invoice 85 multi-period trên PDF và ba scan CRBT có source FX=0, không tự sửa/đổi tiền. Host vẫn v12, chưa financial commit/cutover.

**Invoice dòng con cuối đã tái hiện donor:** [group balancing V4](docs/handover/DGC_INVOICE_GROUP_BALANCING_20261023.md) giải thích đúng −0,01 USD ở chi tiết cuối Invoice hàng 79; một Invoice–AR/bốn revenue đã ghi/đọc thử/replay/rollback trên clone host, 37 master links không đổi. Bốn Issued strict + một V4 đã trial riêng; còn ba Issued held, chưa full import/registry/UAT. Không thay số nguồn hoặc mở gate cũ; website vẫn v12.

**V12 đã online — adapter thu lịch sử giữ nguyên nguồn:** [source receipts](docs/handover/DGC_SOURCE_RECEIPTS_20261023.md) kiểm đủ 51 khoản/45 Invoice trên clone host: VND phần lẻ và FX tới 12 chữ số giữ nguyên, raw actor/date tách khỏi local approver, replay 0 trùng/rollback sạch, không cash. DB/API/UI guards đã triển khai từ deploy `28270590`; backup DB trước đổi thành công, host đủ 25 migrations/no pending, health 200 và storage marker preserved. Chưa nhập tài chính hoặc cutover; không bỏ các Invoice/revenue/scope holds từ kết quả receipt-only trial.

**Mốc mới — v11/storage và nối staging tài chính:** [host finance bridge](docs/handover/DGC_HOST_FINANCE_BRIDGE_20261023.md): marker storage preserved qua redeploy v10→v11, backup website thành công và restore marker local khớp bytes/hash. Đã sửa Invoice resolver để nhận đúng 37 master links dùng hash gói riêng; trên clone backup host, stage đủ 3.154 raw rows rồi thử bốn Invoice–AR/revenue, replay 0 trùng/rollback sạch, 48 assertions và 56/217 PostgreSQL hồi quy + 32 suites đạt. Browser đã phục hồi. Chưa financial commit; còn bốn Issued Invoice held và adapter 51 receipts (bốn VND phần lẻ), files/registry/UAT.

**Owner đã chốt tài chính:** [quyết định 23/10](docs/handover/DGC_FINANCIAL_OWNER_DECISIONS_20261023.md) xác nhận cả ba mapping Invoice/AR → revenue và SOA chỉ tính thu đến hết ngày chốt. Approval đã ghim snapshot/row/PDF; graph và toàn chuỗi plan đã dựng lại. Không còn chờ trả lời hai câu hỏi này; tài chính chưa import và source/PDF/số tiền không đổi.

**V10 đã online và nguồn đã đối chiếu lại:** [kiểm triển khai/nguồn](docs/handover/DGC_SOURCE_DELTA_AND_V10_20261023.md): chính sách SOA mới hiển thị đúng trên website DGC, health/runtime trả 200. Đọc lại đúng workbook nguồn: 25 bảng/3.154 hàng khớp toàn bộ row hash snapshot 19/10; không thêm/xóa/sửa hoặc đổi header/bounds. Đây là multi-request read, chưa phải snapshot đã khóa tại cutover. Storage probe tạo file thành công trên v10; chưa chứng minh giữ qua redeploy.

**Danh mục đã nhập lên DGC thật:** [master transfer](docs/handover/DGC_MASTER_TRANSFER_20261023.md) đã preview/rollback rồi apply 10 dịch vụ, 4 đối tác, 9 hợp đồng, 14 liên kết qua admin; UI đọc đủ, Movitel Active và hai alias đúng. Website/DB backup trước nhập và DB backup sau nhập thành công; backup DB thật đã restore local/18 kiểm đạt, đủ 37 links/38 audit và 0 financial rows. Importer đã tắt và kiểm từ UI bị chặn; bootstrap/seed vẫn tắt. Tài chính chưa nhập; local migration guards không đổi. Owner đã trả lời financial links/SOA cutoff, dùng hồ sơ quyết định ở trên.

**Môi trường DGC đã online:** [kích hoạt host DGC](docs/handover/DGC_HOST_ACTIVATION_20261023.md) ghi Digicom-Erp v7/DB riêng, health connected, persistent path /app/storage và seed kỹ thuật DGC (103 permissions/16 sequences). Owner đã tạo admin; Dashboard vẫn đăng nhập đúng DGC sau reload v7. AUTH_BOOTSTRAP_ENABLED đã tắt và redeploy; seed vẫn false. Không dùng connector GST; browser owner hiện đã ở đúng tài khoản DGC. Chưa financial import hoặc cutover.

**Lưu ý nhập GitHub trên host:** chọn nhánh triển khai **`codex/dgc-deploy`**, không chọn nhánh mã nguồn `dgc/main` trong bộ quét tự động nhiều dự án. Release được đóng gói thành một Fastify app tại gốc, UI build trong `public`, `ERP_WEB_ROOT=/app/public`; giữ cổng 3000 và volume `/app/storage`. Xem [hướng dẫn một website](docs/handover/DGC_SINGLE_SITE_CUTOVER_20261023.md).

**Ưu tiên mới của owner:** cắt chuyển trong ngày, triển khai **một website ERP DGC** (web/API chung Node process). Repo riêng `https://github.com/nguyenhai1080/digicom-erp.git`, nhánh `dgc/main`; timezone đã chốt `Asia/Ho_Chi_Minh`. Owner xác nhận chưa có môi trường đích; connector hiện vẫn là GST. Làm theo [chuẩn bị một website và checklist cutover](docs/handover/DGC_SINGLE_SITE_CUTOVER_20261023.md), không tiếp tục chia nhỏ các đợt ngoại lệ trước đường găng môi trường → nhập/đối chiếu staging → UAT → snapshot cuối/backup/chuyển vận hành.

[Đã chốt phần Invoice source rounding đang làm](docs/handover/DGC_INVOICE_SOURCE_ROUNDING_20261023.md): một Invoice–AR/sáu nhóm/chín revenue đọc đủ, 23 model counts rollback khớp; 32 suites/118 PostgreSQL mới và hồi quy đạt. Registry worklist vẫn 36/35 do chưa ghép profile này; chưa nhập tài chính.

## Trạng thái sau tiếp nhận 19–22/10

[Registry với Invoice có delta trái dấu](docs/handover/DGC_REFERENCE_OFFSETTING_REHEARSAL_20261023.md): thêm bốn package/bốn links/ba Invoice–AR với 17 nhóm/26 revenue đã ghi/đọc thử, guard 3/3 và replay/rollback 23 model counts đạt. 31 suite/135 PostgreSQL mới và hồi quy đạt. Worklist còn 36 Invoice dependencies chặn 35 documents có refs; 31 package no-ref riêng. Chưa nhập tài chính hoặc promote source Approved.

[Invoice có sai lệch trái dấu bù nhau](docs/handover/DGC_INVOICE_OFFSETTING_REHEARSAL_20261023.md): ba Invoice–AR/17 nhóm/26 revenue đã ghi và đọc thử đủ, replay 0 trùng/rollback 23 model counts khớp. 30 suite/104 PostgreSQL mới và hồi quy đạt; giữ nguyên components/gates strict/V1. Chưa ghép profile mới vào SOA/package hoặc nhập tài chính.

**[Roadmap hiện hành và mốc tiếp theo](docs/handover/DGC_ROADMAP_STATUS_20261022.md): đang diễn tập migration tài chính địa phương, chưa nhập chính thức hoặc go-live.** Đọc bảng này để xem toàn cảnh; các mục dưới là lịch sử từng đợt, không phải các chặng đã nghiệm thu.

[Registry package có Invoice rounding](docs/handover/DGC_REFERENCE_ROUNDING_REHEARSAL_20261023.md): bảy package/bảy links/bảy Invoice–AR với 40 nhóm/61 revenue đã ghi/đọc thử, guard hủy chặn đúng 7/7, replay/rollback 23 model counts khớp. 29 suite/107 PostgreSQL mới và hồi quy đạt; 39 Invoice dependencies còn chặn tài liệu, 31 package no-ref giữ riêng. Không promote source Approved, mở gate strict hoặc nhập tài chính.

[Ngoại lệ Invoice/AR — đã chốt kiểm](docs/handover/DGC_INVOICE_ROUNDING_REHEARSAL_20261022.md): lượt 23/10 đọc đủ tám Invoice/70 revenue, 23 model counts rollback khớp; 96 PostgreSQL/27 suite cùng hồi quy đã đạt, giải quyết phần kiểm bị gián đoạn trước đó. Giữ nguyên components/khoản đã thu, không financial import hoặc activation.

[Lưu/đọc ngoại lệ và trial snapshot thật](docs/handover/DGC_ROUNDING_EXCEPTION_REHEARSAL_20261022.md): 66 nhóm/105 revenue ghi thử, 73 metadata ±0,01 USD giữ nguyên components; runtime đọc 105/105, replay 0 trùng, 23 nhóm bảng rollback khớp. API build, 26 suite/21 shape + 30 reader + 83 PostgreSQL mới và hồi quy đạt. Strict gates/Invoice/registry cũ giữ nguyên; chưa import hoặc activation.

[Characterization làm tròn donor](docs/handover/DGC_DONOR_ROUNDING_20261022.md): cả 111 revenue lệch ±0,01 USD tái hiện đúng recipe Number nguồn; 92 đủ source checks, 17 có native identity khác, hai còn check khác. Đã giải thích component propagation ở 21/46 Invoice blocker, không đổi gate hoặc số lịch sử. 25 suite/57 assertions mới đạt; chưa nhập thêm tài chính.

[Diễn tập registry tài liệu–Invoice](docs/handover/DGC_REFERENCE_REGISTRATION_20261022.md): hai tài liệu × hai Invoice giả lập, bốn links, replay 0 trùng và rollback sạch; guard runtime chặn cả SOA Draft riêng. 24 suite/19 planner + 76 PostgreSQL assertions đạt. Snapshot thật có 46 Invoice blocker, chưa có whole-document candidate; 31 package không có refs giữ riêng. Migration document provenance chỉ áp DB synthetic mới; chưa đăng ký/kích hoạt tài liệu thật.

[PDF gốc SOA/gói phê duyệt](docs/handover/DGC_REFERENCE_FILES_20261022.md): đã lấy/kiểm đủ 77 file, 145.848.978 byte; backup/restore 160 entries đạt. 46 tài liệu có refs + bytes, 31 package không có Invoice refs giữ riêng. 23 suite/52 assertions mới đạt; chưa ghi registry, promote file hoặc kích hoạt/hủy Invoice.

[Tham chiếu Invoice trong SOA/package](docs/handover/DGC_INVOICE_REFERENCES_20261022.md): đã rà ba SOA/21 detail và 74 package, 64 liên kết tới 50 Invoice đều bound cấu trúc. Cả bốn Invoice trial có tham chiếu, cần historical document lifecycle/registry trước activation/hủy. 22 suite đạt, gồm 49 assertions mới; chưa kiểm file SOA/package hoặc ghi registry.

[Diễn tập khôi phục Invoice/AR](docs/handover/DGC_INVOICE_RESTORE_REHEARSAL_20261022.md): planner đủ 91 Invoice; bốn candidate đã ghi thử/replay 0 trùng/rollback sạch trên DB copy riêng. 49 held, 33 archive, năm nháp giữ riêng; không tạo payment approval hoặc cash. 21 suite/129 assertions mới + 56 PostgreSQL đạt. Provenance migration chỉ áp hai DB Invoice trial; chưa financial import/activation.

[PDF gốc trong historical adapter](docs/handover/DGC_RECON_PDF_RUNTIME_20261022.md): runtime kiểm/tải PDF qua document row/file ID và manifest pin; đã kiểm đủ 261 originals/231.836.275 byte, năm thiếu trả 404. Chỉ technical review, không tạo attachment/upload/approval hoặc mở import. API build, 60 PDF + 94 source + 59 PostgreSQL assertions và 20 suite migration đạt; cấu hình thật/UI vẫn chưa bật.

[Historical source adapter — lớp đọc evidence](docs/handover/DGC_HISTORICAL_SOURCE_ADAPTER_20261022.md): runtime/API technical review kiểm pinned row/link/target/item/document evidence, giữ source actor/date riêng và không tạo local approval. Chỉ SYSTEM_CONFIG_EDIT/DGC, mặc định chưa cấu hình; operational use vẫn chặn. API build, 92 HTTP/characterization + 59 PostgreSQL assertions và 20 suite migration đạt; DB synthetic rollback sạch, chưa nhập tài chính.

[InvoiceScope lịch sử theo Total/Child](docs/handover/DGC_REVENUE_SCOPES_20261022.md): nối cấu trúc 51/58 Invoice hiện hành/nháp, bảy giữ review và 33 archive riêng. 261 contract scopes/Total items chỉ tính mỗi Total một lần, giữ actual layout 257 Total-only/bốn Child-expanded; chưa mở import. 20 suite/193 assertions mới đạt; historical source adapter/actor-date còn pending.

[Nối revenue với Invoice/payment/AR lịch sử](docs/handover/DGC_REVENUE_BILLING_20261022.md): rà đủ 409 revenue/91 Invoice; đề xuất 34 PAID, tám INVOICED, năm SUPERSEDED; 362 hàng tiếp tục review. Giữ draft/business-scope reservations, TOTAL/CHILD và archive riêng; chưa gán Invoice Ready, phân bổ receipt hoặc mở import. 19 suite/115 assertions mới đạt; target scope/adapter lịch sử vẫn pending.

[Proposal lifecycle/revision doanh thu lịch sử](docs/handover/DGC_REVENUE_LIFECYCLE_20261022.md): đã giữ đủ 265 nhóm/409 rows, đề xuất hai Recon edges/năm Revenue edges từ audit, không đoán Invoice Ready cho Approved nguồn. Actor/date/status gốc giữ canonical JSON; không tạo local approval hoặc current records. 18 suite/52 assertions mới đạt; còn adapter lịch sử và mapping Invoice/payment/AR.

[Gate evidence và source lifecycle](docs/handover/DGC_RECON_GATES_20261022.md): đã hợp nhất 265 nhóm/409 revenue; 145 nhóm/151 hàng sang rà soát kế tiếp, 120 nhóm giữ lại, không mở import. Hai chuỗi Cancelled/Approved/N khớp mẫu donor; audit bổ sung chỉ đọc đã xác lập hai quan hệ thay thế nguồn, tách khỏi snapshot. 17 suite/104 assertions mới đạt; target revision/actor-date/Invoice-payment-AR vẫn pending.

[OCR và dòng con đối soát](docs/handover/DGC_RECON_OCR_AND_CHILD_20261021.md): sáu scan có Payable USD khớp quan sát ảnh và hai pass OCR cục bộ; giữ riêng identity/Revenue/WHT chưa đủ evidence. Trong 144 child rows, 94 khớp printed native + USD link, 47 khác và ba thiếu bytes. Ba dòng lệch nhiều thuộc header Cancelled nhưng revenue vẫn Approved; giữ HELD và historical amounts, chưa nhập tài chính.

[Nội dung bảng tổng USD PDF nguồn](docs/handover/DGC_RECON_SEMANTICS_20261021.md): đọc được tổng của 255/261 PDF; 249 revenue Total khớp, bốn dòng khác PDF, sáu PDF không có text layer. Một nhóm từng REHEARSABLE theo cấu trúc cần review chênh lệch mới. Giữ toàn bộ business HELD và số tiền nguồn; 12 suite/32 assertions mới đạt, chưa nhập tài chính hoặc nghiệm thu child/lifecycle.

[PDF đối soát nguồn và custody](docs/handover/DGC_RECON_FILES_20261021.md): đã lưu/kiểm bytes 261/266 file (231.836.275 bytes), năm ID chưa truy cập được qua Drive (404). Cấu trúc 261 PDF đọc được; 166 nhóm/202 revenue có bytes để review tiếp, 96 nhóm nghiệp vụ HELD không tự mở. Manifest ghim hash, 60 assertions mới đạt; chưa kiểm toàn bộ nội dung PDF hoặc nhập financial records.

[Diễn tập ghi đối soát → revenue trên PostgreSQL](docs/handover/DGC_REVENUE_REHEARSAL_20261021.md): 169 nhóm/205 dòng của snapshot thật đã ghi thử, replay không trùng và rollback toàn bộ trên DB phục hồi riêng; 96 nhóm/204 dòng giữ lại. Đã tách basis MZN tham chiếu trong legacy Recon khỏi money USD và bảo toàn serial ngày qua JSON. 48 kiểm tra target/217 PostgreSQL đạt; chưa có commit financial import hoặc xác minh PDF gốc của các nhóm này.

[Chuẩn bị lớp doanh thu migration](docs/handover/DGC_REVENUE_MIGRATION_20261021.md): giữ riêng hai cơ sở tiền của 409 hàng, chỉ 263 Approved/TOTAL/Y thuộc tổng tháng. 294 hàng vượt kiểm cấu trúc, 115 cần đối chiếu; giữ hai Total/N và các chênh lệch số tiền. Có review/verify và 86 assertions mới đạt; chưa ghi doanh thu tài chính vào staging/runtime.

[Chuẩn bị migration InputRecon/AP lịch sử](docs/handover/DGC_INPUT_FINANCE_MIGRATION_20261021.md): ba bản Generated, không AP; 20 phép kiểm khớp và một chênh lệch 0,5 VND được giữ nguyên. Đã lưu/kiểm PDF gốc dùng chung cho cả ba hàng, số phải trả khớp nguồn. Tám suite migration đạt, gồm 76/13 assertions mới; chưa nhập tài chính hoặc duyệt đối soát.

[Tra cứu Invoice lịch sử trong ứng dụng](docs/handover/DGC_INVOICE_HISTORY_RUNTIME_20261021.md): API/UI chỉ đọc từ kho ghim hash và UUID công ty; 63 kiểm tra API đạt. [Đã kiểm UI](docs/handover/DGC_INVOICE_HISTORY_UI_20261021.md) tìm số trùng, phân trang, chi tiết, retry và tải PDF khớp byte; sửa tìm lại cùng query không reload. PDF inline vẫn chưa nghiệm thu. Chưa cấu hình kho thật cho người dùng hoặc nhập DB.

[Gói Invoice lịch sử](docs/handover/DGC_INVOICE_ARCHIVE_20261020.md): đã tách 33 bản Superseded/Cancelled cùng PDF gốc vào kho evidence private, giữ số âm/liên kết thiếu và nhận dạng theo hàng nguồn; verify/replay/tra cứu 10 dòng đạt. Reader filesystem đã bổ sung ngày 21/10, chưa nhập DB.

[Đối chiếu ngày chốt SOA](docs/handover/DGC_SOA_CUTOFF_REVIEW_20261020.md): đã có màn/API chỉ đọc so sánh hai chính sách khoản thu, tổng USD/VND riêng, 10 dòng/trang; 56 kiểm tra SOA và 223 hồi quy quyền đạt, đã kiểm browser. Chưa chọn cutoff hoặc phát hành SOA.

[Kiểm tra UI kế toán](docs/handover/DGC_ACCOUNTING_UI_20261020.md): đã chạy browser lưu tỷ giá tại màn đối soát → tự tải nguồn → tạo nháp đầu vào; sửa mở form từ kỳ thiếu và bỏ xác nhận khi chỉnh dữ liệu. Kiểm phân trang 10 dòng, audit đúng kế toán, AP/cash vẫn 0 trong DB giả lập.

[Kế toán nhập tỷ giá và chuẩn bị đối soát](docs/handover/DGC_ACCOUNTING_PREPARATION_20261020.md): theo chỉ đạo mới, có mẫu DGC_ACCOUNTANT và phần tỷ giá tại cả hai màn hình đối soát; chuẩn bị nháp được, không mở duyệt cuối/cấu hình ký/quỹ. Build, 223 kiểm tra quyền và 105 đối soát DGC đạt; chưa gán tài khoản thật.

[Đọc lịch sử thu Invoice](docs/handover/DGC_RECEIPT_READ_20261020.md): đã tách INVOICE_PAYMENT_VIEW cho Staff/Manager/BOD; reader Staff không mở cash accounts/balances, payment writer hoặc tải chứng từ ngân hàng. Mẫu quyền chưa gán cho tài khoản thật.

[Quyền tỷ giá DGC](docs/handover/DGC_FX_ACCESS_20261020.md): Manager/BOD có quyền tạo tỷ giá riêng, UI truy cập ngoài cấu hình ký, phân trang 10; 149 kiểm tra role/manual/FX, 187 InputRecon/AP và 264 hồi quy đạt. Chưa mở sửa tỷ giá đã có hoặc cấp quyền tài khoản thật.

[Quyền doanh thu và mẫu vai trò DGC](docs/handover/DGC_ROLE_ACCESS_20261020.md): đã tách năm quyền nhập tay khỏi OCR, thêm Gửi kiểm tra và mẫu Staff/Manager/BOD có dẫn nguồn. Mẫu chỉ điền biểu mẫu, chưa tự tạo/gán cho người dùng thật; full role parity và kiểm UI mới vẫn chưa nghiệm thu.

[Bộ lọc Invoice quá hạn](docs/handover/DGC_INVOICE_OVERDUE_20261020.md) đã sửa theo ngày chốt explicit, giữ nguyên stored status/số tiền; 149 assertions DGC và 264 hồi quy đạt. Tương tác browser của bộ lọc mới chưa kiểm trọn do phiên bị gián đoạn; SOA cutoff vẫn chờ owner.

[Luồng hủy Invoice chưa thanh toán](docs/handover/DGC_INVOICE_CANCEL_20261020.md) đã có API/UI và kiểm thử DB/browser fixture: giữ lịch sử/file/AR amounts, ngừng công nợ hiện hành, mở nguồn lập lại; không cash posting. SOA/package mới có guard tham chiếu để tích hợp tiếp, chưa phải runtime SOA hoàn chỉnh.

[Chuẩn bị lịch sử Invoice và PDF gốc](docs/handover/DGC_INVOICE_HISTORY_20261020.md): gói 91 Invoice (53 hiện hành, 5 nháp, 33 lịch sử), 5 bản cần đối chiếu cấu trúc. Đã sao lưu/kiểm bytes 91 PDF riêng; ba ánh xạ liên kết tài chính đang chờ owner, chưa áp dụng. Chưa nhập financial records.

Đã chạy [rà soát liên kết migration](docs/handover/DGC_REFERENCE_REVIEW_20261020.md): 3.154 hàng/10.894 liên kết, giữ 7 nhóm trùng ID; còn 63 liên kết cần đối chiếu. Đây là báo cáo đọc snapshot, chưa cho phép nhập tài chính.

[Đối chiếu số tiền lịch sử](docs/handover/DGC_FINANCE_REVIEW_20261020.md): payment/balance của 91 Invoice và 53 AR hiện hành khớp; đã ghi riêng sai khác làm tròn, nguồn chưa rõ và một dòng âm thuộc Invoice Superseded. Chưa sửa hoặc nhập chứng từ thật.

Đã có [InputRecon/AP và kiểm thử UI mới nhất](docs/handover/DGC_INPUT_RECON_AP_20261020.md): tính theo hợp đồng Input, generate Draft, PDF biên bản và approve tạo AP, giữ provenance và không phát sinh cash posting. SOA đang chờ xác nhận cách tính khoản thu theo ngày chốt; migration tài chính/toàn chuỗi chưa hoàn tất.

Đợt tiếp tục đã lấy snapshot 25 bảng/3.154 hàng vào staging riêng, nhập thử 10 dịch vụ, 4 đối tác (Movitel Active), 9 hợp đồng và 14 liên kết dịch vụ theo xác nhận owner, triển khai adapter Invoice DGC, ảnh ghép ký đối soát theo xác nhận owner và kiểm thử DB/PDF Linux. Đọc [kết quả migration và Invoice mới nhất](docs/handover/DGC_MIGRATION_AND_INVOICE_20261019.md) trước các nhận định lịch sử bên dưới. Chưa nhập financial record thật; thuế/alias hợp đồng đã được xử lý và kiểm tra replay/restore, InputRecon/AP/SOA và migration toàn chuỗi chưa hoàn tất.

Code đã được đưa vào repository Git riêng tại thư mục này, branch `dgc/main`, kế thừa `f97eb627`; chưa cấu hình remote hoặc triển khai. Đọc [tiến độ và khoảng trống hiện tại](docs/handover/PROGRESS_20261019.md) cùng [kế hoạch môi trường/chuyển dữ liệu](docs/handover/DGC_ENVIRONMENT_MIGRATION_PLAN.md). Phần dưới là yêu cầu bàn giao ban đầu; nhận định thư mục trống/chưa có Git không còn là trạng thái hiện tại. Ưu tiên tiếp theo là Invoice DGC, mapping quyền/tài sản ký, rồi InputRecon/AP/SOA trước staging.

Đọc [tài liệu bàn giao](docs/handover/HANDOVER.md) trước khi sửa code, nhập dữ liệu hoặc triển khai. Project Codex DGC-ERP hiện trỏ tới `D:/Projects/DGC-ERP`; thư mục này còn trống trước khi lưu tài liệu và chưa có Git ứng dụng.

Mục tiêu là đưa DGC Finance lên Vibehost ở tài khoản cũ, tên miền `erp.digicomjsc.com`, dùng code phát triển từ ERP Core và chuyển dữ liệu từ `DGC_ERP_2026_PROD_RC1_CLONE`. GST đã chuyển sang tài khoản mới; không sửa code hoặc dữ liệu sản xuất GST để làm DGC.

## Yêu cầu đầu tiên cho phiên Codex tiếp theo

> Đọc START_HERE.md và docs/handover/HANDOVER.md. Phân biệt code ERP Core dự kiến dùng cho DGC với Apps Script hiện hành. Kiểm tra nhánh feature/dgc-finance tại D:/Projects/DGC-FINANCE-WEB, so sánh với nền GST ổn định và đọc baseline nghiệp vụ DGC. Chuẩn bị code và repository DGC riêng trong project này; trước khi triển khai phải có kế hoạch môi trường DGC độc lập và rà soát tính năng còn thiếu. Chuyển dữ liệu phải thử trên staging, giữ nguồn gốc và đối soát trước khi đưa vào sử dụng.

Các việc tạo repository, giải phóng host cũ, triển khai DGC và nhập dữ liệu chưa hoàn tất. Tài liệu bàn giao không thay thế bước kiểm tra này. Không đưa `.env`, token, bản sao dữ liệu thật hoặc kho PDF lên Git.
