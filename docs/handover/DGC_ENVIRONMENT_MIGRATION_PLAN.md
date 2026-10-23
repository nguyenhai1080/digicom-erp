# Kế hoạch môi trường và chuyển dữ liệu DGC

Ngày 19/10/2026, Asia/Saigon. Đây là kế hoạch chuẩn bị, chưa phải biên bản nghiệm thu hay lệnh triển khai.

Cập nhật owner 23/10: [một website DGC và cắt chuyển](DGC_SINGLE_SITE_CUTOVER_20261023.md) thay phương án hai service web/API bên dưới. Repo riêng `nguyenhai1080/digicom-erp`, nhánh dgc/main; timezone chốt Asia/Ho_Chi_Minh. Owner xác nhận chưa có môi trường đích. Phần còn lại giữ lịch sử kế hoạch ban đầu; không dùng trạng thái timezone-pending hoặc hai website để cấu hình mới.

Trạng thái cập nhật 22/10: đọc [roadmap hiện hành](DGC_ROADMAP_STATUS_20261022.md). Đã có snapshot trong checkout DGC, master importer, review/planner và rehearsal rollback-only revenue/Invoice/AR; các nhận định chưa có snapshot/importer/DB thử ở phần kế hoạch ban đầu bên dưới là lịch sử. Chưa có financial import commit hoặc môi trường DGC từ xa.

Đã bắt đầu staging địa phương và triển khai Invoice DGC riêng; xem [kết quả và phạm vi đã kiểm tra](DGC_MIGRATION_AND_INVOICE_20261019.md). Phần dưới giữ kế hoạch đích; trạng thái importer/chưa có DB thử trong bản đầu không còn mô tả toàn bộ hiện trạng.

## Môi trường độc lập

| Thành phần | Địa phương | Staging | Production |
| --- | --- | --- | --- |
| Code | DGC-ERP, Git branch `dgc/main` | Remote DGC riêng, commit được duyệt | Cùng remote, commit đã nghiệm thu |
| API/UI | Node 22 / pnpm 10.18.3, UI Vite 5173 / API 3000 | Hai service DGC riêng, chưa cấp ID | Hai service DGC riêng, chưa cấp ID |
| PostgreSQL | Compose project `dgc-finance-dev`, DB `dgc_finance_dev`, loopback 55432 | DB DGC staging riêng, chưa cấp hostname | DB DGC production riêng, chưa cấp hostname |
| File | `storage/` ignored trong checkout DGC | Volume riêng `/app/storage` | Volume riêng `/app/storage`, backup DB + file cùng mốc |
| URL | localhost | Hostname staging DGC chưa cấp | `erp.digicomjsc.com`, chưa xác minh quyền DNS |
| Bí mật | `.env` ignored | Tạo secret/session/DB credentials riêng | Secret riêng, không dùng lại staging/GST |

Kết nối Vibehost hiện trả về **GST Vietnam** và chỉ liệt kê `gst-erp-api`, `gst-erp-web`. Phải kết nối tài khoản cũ **Công ty Cổ Phần Đầu Tư và Truyền Thông Số**, rồi kiểm tra lại whoami/list_projects. Chưa có thông tin kết nối tài khoản cũ trong phiên này. Không cấp ID dịch vụ hoặc DB GST làm giá trị thay thế trong cấu hình DGC.

Sau khi có remote DGC private và tài khoản đúng: tạo staging DGC độc lập; API build root bằng Dockerfile, UI build `apps/web`; đặt API_BASE_URL của UI về API DGC, APP_URL của API về UI DGC. Gắn DB vào API, storage vào API. Ghi service ID, hostname DB, volume, DNS, commit và thời điểm backup vào hồ sơ môi trường riêng; không ghi mật khẩu/token vào Git.

`deploy/dgc.env.example` chỉ là mẫu: tên pháp nhân để trống, phải cung cấp giá trị xác nhận. Chủ sở hữu xác nhận DGC không cần hỗ trợ MZN; phạm vi vận hành là USD/VND, seed mặc định USD. MZN chỉ giữ trong dữ liệu/PDF nguồn để đối soát, không tự quy đổi hoặc tạo giao dịch MZN. Africa/Maputo là timezone baseline donor, vẫn cần xác nhận riêng trước seed. `ERP_SEED_ON_START=false`, bootstrap mặc định tắt. Seed hiện từ chối company code ngoài DGC và database đã có tenant khác; không có tài khoản đăng nhập hoặc dữ liệu tài chính mẫu được seed. Chỉ cấp ADMIN kỹ thuật theo quy trình khởi tạo riêng; chưa thay thế mapping Staff/Manager/BOD.

Migration lịch sử `20261007173000_gst_company_identity` vẫn giữ nguyên để bảo toàn lịch sử upstream: nó đổi DEFAULT thành GST nếu DEFAULT tồn tại. DGC phải migrate DB mới trống rồi seed DGC; không restore DB GST làm nền DGC hoặc chạy migration trên DB chưa xác minh. Migration không tự chạy seed.

Các dịch vụ GST cũ chỉ được giải phóng sau backup cuối, xác minh GST mới hoạt động và xác nhận phạm vi xóa. Không cần xóa host cũ để hoàn thành code/audit địa phương.

## Chuyển dữ liệu thử

Nguồn duy nhất: `DGC_ERP_2026_PROD_RC1_CLONE`, workbook `1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A`. Snapshot 14/10 nằm riêng tại `D:/Projects/ERP-CORE-WEB/artifacts/dgc-migration`; chưa sao chép vào repository này. Snapshot mới phải xuất chỉ đọc trước staging và trước cutover. Giữ source checksum, thời điểm xuất, spreadsheet ID, sheet ID/tên, hàng nguồn thực tế, ngày raw/display, múi giờ nguồn và revision. Nếu snapshot không giữ số hàng thực tế, phải bổ sung ở lần xuất mới; không suy số hàng từ vị trí mảng khi đã lọc.

1. Lập manifest số dòng và tổng tiền theo kỳ/đối tác/dịch vụ/tiền tệ/trạng thái. Không cộng USD, MZN, VND thành một tổng. Lưu raw snapshot và manifest chi tiết trong kho riêng có backup.
2. Thiết kế import batch và bảng mapping với khóa nguồn `(spreadsheet, sheet, sourceRow, sourceId)` cùng digest/revision. Khóa định danh ổn định của lần nhập tách khỏi checksum nội dung: chạy lại cùng snapshot phải no-op; hàng thay đổi phải báo xung đột hoặc có quy trình cập nhật, không tạo thêm bản ghi tài chính. Việc chèn/xóa hàng giữa hai snapshot cần đối chiếu lại nguồn và liên kết, không tự coi cùng số hàng là cùng hồ sơ.
3. Giải quyết REV0419, REC0181, REC0040/0102/0211/0274 và RDL0445 theo chuỗi chứng từ, kỳ, dịch vụ/hợp đồng và số tiền. Giữ cả hàng nguồn khi chưa có quyết định; không chọn bản đầu theo ID. Owner đã xác nhận MYCLIP → MEUCLIP và MEU PAR → MEUPAR; đã áp dụng riêng cho contract-service links của snapshot 19/10 với audit. Các tổ hợp/tham chiếu tài chính khác vẫn cần mapping có bằng chứng.
4. Nhập danh mục/hợp đồng, tài liệu và chuỗi đối soát/doanh thu trước Invoice/revision, AR/AP, payment/transaction và SOA. Bảo toàn tiền lịch sử, trạng thái, tiền gốc/quy đổi và cờ tổng/chi tiết; không dùng lệnh tạo Invoice GST hoặc công thức hiện tại để tái tính lịch sử DGC.
5. Xác định AR_AP và INVOICES biểu diễn khoản phải thu nào, bảo đảm một current AR/Invoice đủ điều kiện. Tám nguồn Invoice chưa khớp là hàng chờ quyết định, không sửa bảng nguồn để vượt kiểm tra.
6. Ghép 51 payment và 54 transaction theo quan hệ thực tế. Phân bổ Invoice và dòng tiền là hai vai trò của cùng khoản thu; lịch sử chỉ cập nhật Invoice/AR/revenue theo quy tắc bàn giao, chưa ghi sổ tiền cho tới khi xác nhận sổ và số dư đầu kỳ. Endpoint bổ sung khoản lịch sử vào tài khoản đã tồn tại trong code GST; không gọi hàng loạt cho DGC.
7. Với file: manifest Drive ID → file đích, kích thước, hash, loại bản gốc/ký, quan hệ hồ sơ, quyền truy cập. Tải và kiểm tra file trước khi công nhận di chuyển. 465 Drive ID ở kiểm kê chưa phải 465 file đã khôi phục. Không tái sinh PDF để thay file gốc đã ký.
8. Chạy lại import cùng snapshot và đối chiếu row count, financial totals, AR/AP, payment allocation và cash/bank trước/sau. Dùng lỗi chủ động giữa transaction để kiểm tra rollback. Các trường hợp thiếu mapping, nguồn trùng, tiền tệ/tỷ giá không rõ phải dừng phần liên quan và xuất báo cáo xử lý.

Importer, bảng mapping và công cụ đối soát toàn chuỗi **chưa được triển khai**. Không sử dụng các script import lịch sử riêng GST trong ignored artifacts của checkout khác cho DGC.

Cập nhật 21/10: đã có master importer/provenance và [diễn tập ánh xạ đối soát–revenue rollback-only](DGC_REVENUE_REHEARSAL_20261021.md) trên bản backup phục hồi riêng (169 nhóm/205 dòng, replay và rollback đạt). Chưa có importer tài chính toàn chuỗi được phép commit; PDF custody, lifecycle/revision, actor/date và Invoice/payment/AR vẫn cần hoàn tất. Không dùng kết quả rehearsal như nghiệm thu chuyển dữ liệu.

## Điều kiện nghiệm thu và cutover

- Staging hoàn thành Invoice DGC, input recon/AP/PDF, SOA, USD/VND, quyền, lịch sử thay thế/hủy, audit và báo cáo; có fixture từ donor và kiểm tra đầy đủ tác động DB/file.
- Đối soát approved revenue (không cộng TOTAL + CHILD), current issued Invoice, current AR/AP, payment, số dư đầu/cuối và SOA theo từng tiền tệ/kỳ/đối tác; ghi rõ mọi chênh lệch. Xác nhận riêng ngữ nghĩa thanh toán SOA theo as-of.
- Kiểm tra phân trang mặc định 10, mã đối tác và định dạng số trên toàn bộ bảng dữ liệu. Hai bảng báo cáo quỹ đã đổi từ 12 về 10; chưa nghiệm thu toàn bộ UI.
- Có backup/restore diễn tập, kế hoạch rollback gồm DB + file + version code. Chưa xác định RPO/RTO, thời điểm khóa nguồn và người nghiệm thu.
- Sau nghiệm thu: chốt thời điểm ngừng ghi Apps Script, xuất snapshot cuối, nhập delta đã kiểm chứng, đối soát lại, gắn DNS/HTTPS và kiểm tra đăng nhập/quyền/tài liệu/số dư. Chỉ một hệ thống ghi chính thức. Nếu rollback sau khi DGC có giao dịch mới, phải đối chiếu các giao dịch đó trước khi mở lại nguồn cũ.
