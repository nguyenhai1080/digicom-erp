# Bàn giao xây dựng và chuyển dữ liệu DGC Finance

> Cập nhật phạm vi của chủ sở hữu ngày 19/10/2026: DGC không cần hỗ trợ MZN trong vận hành. Dùng USD/VND; MZN trong mô tả donor bên dưới chỉ là thông tin nguồn phục vụ đọc PDF/đối soát, không phải yêu cầu phát triển tài khoản, thanh toán hoặc Invoice MZN. Không tự quy đổi số liệu lịch sử. Timezone cần xác nhận riêng, không suy ra từ thay đổi tiền tệ này.

Chốt thông tin ngày 19/10/2026, múi giờ Asia/Saigon. DGC Finance sẽ dùng nền ERP Core, triển khai độc lập trên tài khoản Vibehost cũ tại erp.digicomjsc.com. Nguồn dữ liệu chính thức là DGC_ERP_2026_PROD_RC1_CLONE. DGC chưa được triển khai và chuyển dữ liệu sang ERP Core trong phạm vi công việc đã hoàn thành.

## 1. Quyết định và phạm vi

- Project Codex mới: DGC-ERP, thư mục `D:/Projects/DGC-ERP` theo cập nhật mới nhất của chủ sở hữu. Thư mục còn trống và chưa là Git repository trước khi tạo tài liệu.
- GST dùng tài khoản Vibehost mới và tên miền erp.gsttech.vn. DGC dùng tài khoản Vibehost cũ và tên miền dự kiến erp.digicomjsc.com.
- Mỗi công ty sẽ có code triển khai, database, kho tài liệu, biến môi trường và lịch nâng cấp riêng. Tách project Codex chưa tự tạo repository hoặc dịch vụ mới.
- Chủ sở hữu yêu cầu kế thừa đầy đủ chức năng và cách vận hành ERP DGC hiện tại; Quản lý dự án là phần bổ sung. Không thay thế nghiệp vụ tài chính dịch vụ bằng một ứng dụng quản lý dự án đơn giản.
- Việc chuẩn bị DGC không được thay đổi danh tính, dữ liệu, tài khoản hoặc bản triển khai GST đang vận hành.

## 2. Phân biệt các nguồn code

| Nguồn | Vai trò và trạng thái đã kiểm tra |
| --- | --- |
| `D:/Projects/DGC-ERP` | Thư mục project mới; hiện chỉ có tài liệu bàn giao, chưa chứa code ứng dụng |
| `D:/Projects/DGC-FINANCE-WEB` | Checkout Node/React/PostgreSQL từ ERP Core; nhánh feature/dgc-finance; HEAD `f97eb627ad102e73eb57373d098b0ea162965665` |
| Origin của checkout DGC-FINANCE-WEB | https://github.com/nguyenhai1080/erp-core-web.git — vẫn là repository chung hiện tại, chưa phải repository DGC riêng |
| `D:/Projects/ERP-DGC-PROD-CLONE` | Code Google Apps Script cũ, các file .gs và Index.html; nhánh rc/prod-clone; HEAD `5aae30f8ee19e7902aa0888f29d8cd6c67a4be64`; chưa có origin |
| `D:/Projects/ERP-CORE-WEB-ASSETS` | Checkout nền GST ổn định; HEAD `8eae1774ee2f6b05063cd4e6f85bb7a1c5ee507e` |

Nhánh feature/dgc-finance mới chuẩn bị cấu hình công ty và nhận diện DGC; chưa chứng minh tương đương toàn bộ nghiệp vụ DGC. Nhánh này có nền cũ hơn một số nâng cấp GST gần đây. Cần so sánh commit trước khi chọn điểm xuất phát và đưa cải tiến chung sang; không ghi đè nguyên thư mục GST hoặc giả định chỉ đổi logo là hoàn thành.

Không chạy `clasp push`, deploy Apps Script, migration sửa dữ liệu hoặc các hàm repair từ code DGC cũ chỉ để khảo sát. Code .gs không phải source để triển khai container ERP Core Node. Không lấy nhánh DGC làm nguồn của dịch vụ GST.

## 3. Nguồn nghiệp vụ DGC đã xác định

Ứng dụng Apps Script được xác nhận làm baseline kế thừa qua kiểm tra ngày 08/10/2026:

https://script.google.com/macros/s/AKfycbydoqLjQT7f4tP3Y-6fiieQpNOOuk1GMXP45SNQo0uVKDE9KovuBJ5PeG1wJ32L03G4/exec

Deployment này đã được xác định trỏ tới version 61 tại thời điểm khảo sát. Chuỗi phiên bản nội bộ của source có thể cũ; dùng version triển khai và hash file để nhận diện. Phải kiểm tra lại phiên bản đang sử dụng trước khi chốt chuyển đổi, vì code Apps Script địa phương có thể đã thay đổi sau baseline đó.

Tại checkout `D:/Projects/DGC-FINANCE-WEB`, đọc AGENTS.md và các tài liệu:

- `docs/DGC_INHERITANCE_BASELINE.md`: nguồn kế thừa, quy tắc tính toán, quyền, trạng thái và lộ trình. Bảng coverage trong tài liệu có các mốc cũ; không xem mọi ô Missing là hiện trạng của bản GST 0.6.79.
- `docs/DGC_SOURCE_INVENTORY.json`: danh mục source và hàm, là metadata để tìm nguồn, không chứng minh đã hiểu đủ hành vi.
- `docs/DGC_DATA_CATALOG.json`: khai báo cấu trúc dữ liệu, không phải số lượng dữ liệu sống hiện tại.
- `docs/DGC_OUTPUT_RECON_CORRECTED_WORKFLOW.md`, `docs/DGC_FINANCE_LEDGER_V0621.md`, `docs/INVOICE_PAYMENTS.md`, `docs/COMPANY_ASSETS.md`: các luồng và khả năng đã phát triển sau baseline ban đầu; cần đọc cùng implementation.

Bản source donor version 61 được lưu trong các thư mục ignored `artifacts/dgc-reference` ở checkout ERP Core. Nếu không tìm thấy ở checkout mới, kiểm tra `D:/Projects/ERP-CORE-WEB/artifacts/dgc-reference` và các checkout cũ. Giữ raw donor source và cấu hình riêng tư ngoài Git công khai.

## 4. Nguồn dữ liệu chính thức và kiểm kê

Chủ sở hữu chọn bảng **DGC_ERP_2026_PROD_RC1_CLONE**, không chọn bảng DGC_ERP_2026 còn lại.

https://docs.google.com/spreadsheets/d/1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A/edit

Kiểm kê chỉ đọc ngày 14/10/2026 được lưu tại `D:/Projects/ERP-CORE-WEB/artifacts/dgc-migration`. Đây là dữ liệu khảo sát theo mốc, cần xuất mới trước chuyển đổi chính thức.

| Bảng nguồn | Số dòng ở mốc kiểm kê |
| --- | ---: |
| DM_SERVICE | 10 |
| DM_PARTNER | 4 |
| DM_ACCOUNT | 3 |
| DM_TRANSACTION_CATEGORY | 14 |
| CONTRACTS | 9 |
| CONTRACT_SERVICES | 14 |
| MONTHLY_REVENUE | 409 |
| RECONCILIATION | 411 |
| RECON_PDF_UPLOAD | 303 |
| RECON_PDF_HEADER | 266 |
| RECON_PDF_DETAIL | 429 |
| RECON_PDF_SUMMARY | 532 |
| INVOICE_HEADER | 91 |
| INVOICE_DETAIL | 343 |
| AR_AP | 53 |
| INVOICES | 53 |
| INVOICE_PAYMENT | 51 |
| SOA_HEADER / SOA_DETAIL | 3 / 21 |
| INPUT_RECONCILIATION | 3 |
| TRANSACTIONS | 54 |
| ACCOUNT_BALANCE | 3 |

Các con số là số dòng, không phải mặc định số bản ghi hợp lệ cần nhập. Hai bảng AR_AP và INVOICES có thể là các biểu diễn liên quan; phải xác định ánh xạ và khóa, không nhập thành hai bộ công nợ độc lập. Có 1.939 tham chiếu tài liệu và 465 Drive file ID phân biệt trong kiểm kê; các tham chiếu này chưa đồng nghĩa file đã tải hoặc đã khôi phục.

Tệp tham chiếu nội bộ:

- `preflight-20261014.json`: thống kê, cảnh báo khóa và liên kết.
- `source-20261014.json`: dữ liệu thô; chỉ đọc, giữ riêng tư.
- `date-displays-20261014.json`: đối chiếu giá trị ngày và cách hiển thị, tránh lệch kỳ do timezone.
- `company-config-20261014.json`: cấu hình công ty riêng tư, không chép toàn bộ vào Git.
- `deployment-plan-20261014.json`: có giả định tài khoản triển khai cũ; quyết định mới của chủ sở hữu là DGC dùng tài khoản Vibehost cũ, GST dùng tài khoản mới, nên không thực thi kế hoạch cũ nguyên trạng.

### Các vấn đề phải giải quyết trước import

| Vấn đề | Cách xử lý cần thiết |
| --- | --- |
| REV0419 xuất hiện hai dòng khác nội dung | Ánh xạ theo nguồn PDF, dịch vụ, kỳ, hợp đồng và hàng nguồn; không chọn dòng đầu theo ID |
| REC0181 trùng trong RECONCILIATION | Giữ định danh hàng nguồn và quan hệ thực tế |
| REC0040, REC0102, REC0211, REC0274 trùng trong PDF_UPLOAD | Phân biệt file, kỳ và chuỗi đối soát trước tạo khóa mới |
| RDL0445 trùng trong PDF_DETAIL | Đối chiếu header/upload và số tiền, không loại bỏ tự động |
| MYCLIP, MEU PAR, chuỗi nhiều dịch vụ có dấu phẩy | Là các ứng viên alias hoặc tổ hợp dịch vụ; xác nhận mapping, chưa kết luận là thiếu danh mục |
| 8 dòng liên kết nguồn Invoice cần đối chiếu | Có INV0023, INV0024, INV0051–INV0054, INV0059, INV0060; không sửa bảng nguồn để ép import |

Kiểm kê không phát hiện paymentMismatches và arInvoiceMismatches trong các phép so sánh đã chạy; vẫn còn vấn đề liên kết nguồn nói trên. Không coi kết quả đó là nghiệm thu số dư hoặc toàn bộ quan hệ tài chính.

## 5. Các nghiệp vụ phải đối chiếu cho DGC

GST đã có luồng doanh thu, Invoice, thanh toán, quỹ và Dashboard. Cần kiểm tra lại các đặc thù DGC sau bằng source thực tế, fixture số và kết quả toàn luồng; schema hoặc build xanh không chứng minh nghiệp vụ tương đương.

1. **Danh mục và hợp đồng:** dịch vụ, đối tác, tài khoản, mục đích thu chi; hợp đồng Input/Output/Other, đa dịch vụ, ngày hiệu lực, tỷ lệ chia sẻ, phí cố định, thuế. Không dùng phân loại MAIN/ADDENDUM của dự án thay hợp đồng dịch vụ.
2. **Đối soát đầu ra:** PDF text/OCR của Movitel, header/detail/summary, khớp đối tác/dịch vụ/kỳ/hợp đồng, chặn sai tổng và tỷ lệ, duyệt và thay thế có lịch sử. Không cộng cả dòng tổng và dòng con vào doanh thu.
3. **Doanh thu:** giữ trạng thái, số tiền gốc và tiền quy đổi, nguồn đối soát, quy tắc làm tròn và cờ dòng tổng/chi tiết. Không tự lấy công thức GST thay cơ sở chia sẻ DGC.
4. **Invoice:** mẫu pháp nhân DGC, cách đánh số, nhóm nguồn, thuế/WHT, preview, phát hành, phiên bản hiện hành, hủy/thay thế, tài liệu và thanh toán. Các template và guard gắn GST phải được khảo sát và đổi đúng phạm vi DGC.
5. **Thanh toán và công nợ:** phân biệt số phân bổ, tiền thực nhận, tiền tệ và tỷ giá; mỗi Invoice hiện hành đủ điều kiện có đúng một khoản phải thu hiện hành. Chặn trùng, vượt dư nợ, nguồn cũ và Invoice không đủ điều kiện.
6. **Đối soát đầu vào và phải trả:** hợp đồng đầu vào đang hiệu lực theo dịch vụ và kỳ; cơ sở chia sẻ, FX, thuế/WHT, duyệt BOD, AP và PDF. Đây là phần cần rà soát/phát triển riêng, chưa được nghiệm thu cho DGC trên nền mới.
7. **SOA:** tập Invoice phù hợp, khoản phải thu hiện hành, thời điểm as-of và thanh toán tính đến ngày nào. Source version 61 có điểm cần xác minh về tổng thanh toán khi xem as-of; ghi rõ sai khác, không âm thầm sao chép hoặc sửa.
8. **Thu chi và số dư:** 54 dòng giao dịch nguồn và 51 dòng thanh toán Invoice có thể liên kết cùng dòng tiền. Ánh xạ một lần, không cộng hai lần; đối chiếu số dư đầu kỳ, cuối kỳ và điều chỉnh trước khi đưa vào sử dụng.
9. **Phân quyền và quản trị:** donor có Staff/Manager/BOD; cần bảng mapping hành động và quyền thực tế. Không thay tự động bằng Accountant/Project Manager/Administrator của GST mà chưa đối chiếu.
10. **Tiền tệ và thời gian:** baseline donor dùng MZN/Africa/Maputo và có USD/VND. Cần đối chiếu cấu hình thật của công ty, kỳ báo cáo và cách làm tròn khi chuyển sang nền mới; không áp dụng Asia/Saigon cho dữ liệu nghiệp vụ chỉ vì đây là timezone của người thao tác.

Các mức dung sai 0,02 ở kiểm tra tổng Invoice và 0,01 ở thanh toán được ghi nhận từ donor version 61; phải kiểm tra đúng đơn vị và đường lệnh liên quan trước khi triển khai. Giữ audit cho mọi thao tác thay đổi trạng thái và bút toán.

Quy tắc chung đã được chủ sở hữu yêu cầu: bảng dữ liệu luôn có phân trang; mặc định 10 dòng, hiển thị mã đối tác và số rõ phân cách. Hai bảng báo cáo quỹ GST dùng 12 dòng là yêu cầu riêng GST, không tự áp dụng mọi bảng DGC. Các quyết định lịch sử riêng của GST như số dư VCB 120.765.657 VND hoặc thanh toán IVRJOKE không phải dữ liệu DGC.

## 6. Kế hoạch triển khai trên tài khoản Vibehost cũ

Tài khoản đích DGC là tài khoản cũ có tên Công ty Cổ Phần Đầu Tư và Truyền Thông Số. Kết nối MCP Vibehost đang dùng trong chat ERP Core là tài khoản GST mới; phải kiểm tra whoami và danh sách dự án trước khi tạo hoặc triển khai dịch vụ DGC.

Các tài nguyên GST cũ đã biết để nhận diện khi giải phóng host:

| Dịch vụ GST cũ | ID |
| --- | --- |
| erp-core-web-staging, API | cmuxx3m5w1s8b0j5f5q9yz2rk |
| erp-core-staging-ui, UI | cmuy1b6ex1tf00j5f59zhi89i |

Chưa có bước xóa các dịch vụ này. Cần sao lưu lần cuối, kiểm tra GST sản xuất đã chạy trên tài khoản mới, rồi xử lý giải phóng tài nguyên theo phạm vi chủ sở hữu xác nhận. Không xóa dịch vụ Digicom khác đang có hoặc thay dữ liệu DGC Apps Script.

Thiết kế đích đề xuất: API, UI và PostgreSQL riêng cho DGC; kho `/app/storage` riêng, sao lưu code/DB/file và biến bí mật tách biệt. Tên dịch vụ, ID dự án và hostname DB DGC chưa được cấp; phải ghi lại sau khi tạo, không sử dụng ID/hostname GST làm giá trị tạm trong production.

Khi có dịch vụ đích: API build từ root, UI từ apps/web; API_BASE_URL trỏ API DGC; APP_URL trỏ đúng tên miền DGC; company code, tên pháp nhân và tài sản nhận diện lấy từ cấu hình DGC được xác nhận. Gắn DB đúng API, không gắn vào UI. Giữ bootstrap/seed sản xuất theo kế hoạch khởi tạo được kiểm soát; không chạy seed mặc định lên dữ liệu đã nhập.

## 7. Trình tự công việc tiếp theo

### Chuẩn bị code và kiểm tra chức năng

1. Đọc các nguồn nêu trên, ghi lại phiên bản donor thực tế và bảng chức năng đã có/còn thiếu của code DGC mới.
2. Chọn nền code ổn định, đưa code vào thư mục DGC-ERP và tạo repository DGC riêng. Chưa có repository mới trong bản bàn giao; không đổi remote GST hoặc push nhánh thử vào develop đang phục vụ GST.
3. Hoàn thiện template, cấu hình và nghiệp vụ DGC còn thiếu. Các sửa lỗi dùng chung đưa sang GST bằng thay đổi chọn lọc sau kiểm tra, không đồng bộ tự động toàn nhánh.
4. Dùng Node 22/pnpm 10.18.3 theo package hiện tại. Có thể chạy install với lockfile và build sau khi có code. Test tích hợp tài chính chỉ dùng database thử nghiệm; chọn lệnh test theo package/script và tài liệu từng module thực tế.

### Chuyển dữ liệu thử

1. Xuất snapshot mới, chỉ đọc, từ đúng workbook đã chọn; thống kê theo bảng, kỳ, đối tác, dịch vụ, tiền tệ và trạng thái. Bảo toàn ngày, mã nguồn, revision và liên kết file.
2. Xây mapping khóa cũ sang khóa mới có thêm sheet/hàng/nguồn để xử lý ID trùng. Có báo cáo các dòng cần quyết định; không tự sửa hoặc xóa dòng nguồn.
3. Nhập danh mục/hợp đồng, chuỗi đối soát/doanh thu, Invoice và phiên bản, công nợ, thanh toán/giao dịch, SOA và file theo quan hệ thực tế. Việc tạo financial record khi import phải giữ số liệu lịch sử, không tái tính theo mặc định mới.
4. Đảm bảo import có chống lặp; chạy lại không tăng số dòng hoặc số dư. Đối chiếu thanh toán và giao dịch ngân hàng để tránh ghi cùng tiền hai lần.
5. Kiểm tra hash, truy cập và liên kết tài liệu. File gốc tải lên, file đã ký và chứng từ không thể thay bằng PDF tái sinh nếu không còn bản gốc.
6. Đối soát tổng approved revenue, current issued Invoice, AR/AP, payment, cash/bank và SOA theo kỳ/đối tác/tiền tệ; không cộng tiền khác loại thành một tổng không rõ tỷ giá.

### Đưa vào sử dụng

1. Nghiệm thu staging các luồng đầy đủ và trường hợp sai dữ liệu; chủ sở hữu xác nhận những sai khác nghiệp vụ cần thiết.
2. Chốt mốc ngừng ghi ở nguồn, lấy snapshot cuối, nhập phần cuối theo quy trình đã kiểm chứng và đối soát lại.
3. Gắn erp.digicomjsc.com, kiểm tra quyền quản lý DNS, HTTPS, APP_URL, đăng nhập, tài liệu, số dư và phân quyền.
4. Cho sử dụng một hệ thống ghi chính thức; giữ nguồn cũ để tra cứu/phục hồi theo kế hoạch đã thống nhất. Không để hai hệ thống tiếp tục ghi tài chính song song.

## 8. Trạng thái bàn giao

Đã xác định project mới, thư mục mới, nguồn code, nguồn dữ liệu được chọn, hướng triển khai và các cảnh báo cần xử lý. Chưa tạo repository DGC độc lập, chưa triển khai DGC lên Vibehost, chưa nhập số liệu hoặc di chuyển file DGC, chưa nghiệm thu nghiệp vụ DGC trên nền ERP Core.

Bàn giao chỉ tạo tài liệu địa phương. Không bao gồm mật khẩu, token, private key, `.env` hoặc bản dữ liệu thô; không commit/push code hay gửi tin nhắn sang project khác.
