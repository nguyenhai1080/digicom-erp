# Đợt chuyển dữ liệu thử và Invoice DGC — 19/10/2026

Cập nhật tiếp theo: [InputRecon/AP ngày 20/10](DGC_INPUT_RECON_AP_20261020.md), gồm runtime, PDF, kiểm thử DB/UI và điểm SOA cần xác nhận.

Tài liệu này cập nhật trạng thái sau PROGRESS_20261019.md. Chưa triển khai production, chưa nghiệm thu toàn bộ DGC và chưa đưa số liệu tài chính thật vào các bảng vận hành.

## Nguồn đã kiểm tra lại

- `clasp deployments` tại checkout Apps Script cũ, chỉ đọc: deployment được bàn giao vẫn trỏ **version 61**, mô tả `Prevent-recurring-small-OCR-and-cancelled-invoice-errors`. Không push/deploy/chạy hàm Apps Script.
- Google Drive/Sheets xác nhận đúng workbook **DGC_ERP_2026_PROD_RC1_CLONE**, ID `1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A`.
- Lấy CellData của **25 bảng**, gồm các bảng nghiệp vụ trong snapshot cũ và `55_APPROVAL_PACKAGE`; loại trừ người dùng, bí mật cấu hình, bảng backup/repair và báo cáo sinh lại. Giữ userEntered/effective/formatted values, công thức, định dạng số/ngày, hyperlink/note và số hàng thật.
- Timezone workbook là **America/Los_Angeles**, locale en_GB. Không suy timezone báo cáo từ timezone người thao tác hoặc baseline Africa/Maputo. Serial ngày được chuyển thành ngày lịch nguồn theo epoch Sheets, không chạy qua timezone của máy. Giá trị raw/display luôn được giữ lại.
- Snapshot là nhiều lần đọc liên tiếp, **chưa khóa nguồn và không bảo đảm snapshot tài chính nguyên tử**. Cần xuất lại trong cửa sổ khóa ghi trước cutover; đây là dữ liệu thử.

Tất cả dữ liệu thô, báo cáo chi tiết, quyết định có hash nguồn và backup nằm trong `artifacts/dgc-migration/20261019/`, bị Git ignore. Không có raw donor hoặc dữ liệu thật được đưa vào Git.

## Kết quả chuyển thử thực tế

PostgreSQL riêng trong container **dgc-erp-acceptance-postgres**, cổng loopback **55433**. Không dùng container `erp-core-postgres` ở cổng 5432. Database chứa snapshot thật là **dgc_migration_staging_snapshot_20261019**; các database `*_synthetic`, `erp_execution_acceptance_*` chỉ chứa fixture tổng hợp.

| Hạng mục | Kết quả |
| --- | ---: |
| Hàng nguồn giữ nguyên trong staging | 3.154 |
| Dịch vụ đã nhập vào danh mục | 10 |
| Đối tác đã nhập vào danh mục | 4 |
| Khóa ánh xạ đã lưu | 37 |
| Hợp đồng đã nhập vào staging | 9 |
| Liên kết dịch vụ hợp đồng đã nhập | 14 |
| Revenue / Invoice / cash account / cash entry vận hành từ nguồn thật | 0 |
| User đăng nhập từ nguồn thật | 0 |

Chạy lại staging không tăng 3.154 hàng. Chạy lại services trả về 0 created/10 unchanged; partners trả về 0 created/4 unchanged. Raw rows vẫn giữ ID trùng theo sheet ID/hàng nguồn. Không tạo công nợ từ cả AR_AP và INVOICES, không nhân đôi dòng tiền payment/transaction.

Chủ sở hữu đã xác nhận ánh xạ **Movitel.Status → Active**. Source là `21_DM_PARTNER!R2`, hàng có `Partner_ID=Movitel`, ô trống. Mapping chỉ áp dụng với đúng snapshot/row hash, lưu reason/approvedBy/approvedAt, digest vào kế hoạch và audit `DGC_IMPORT_DECISION`; không sửa Google Sheet. Có đúng một decision audit cho Movitel sau replay.

Chủ sở hữu đã xác nhận đủ **8 quyết định hợp đồng**: CTR0003–CTR0008 dùng chính xác **Tax_Rate = 0.1**, bao gồm CTR0005 có nguồn raw 9.9997; CTS0008 **MYCLIP → MEUCLIP**, CTS0009 **MEU PAR → MEUPAR**. Đã nhập 9 hợp đồng và 14 liên kết, không tạo dịch vụ mới. Raw 10/9.9997 và tên alias nguồn được giữ nguyên; không tính lại số tiền lịch sử. Tổng cộng có 9 decision audit gồm Movitel; replay trả về **0 created / 37 unchanged**, không thêm audit. Kế hoạch master không còn vấn đề chờ xử lý; 40 diagnostics raw toàn chuỗi vẫn còn, chưa được coi là đã giải quyết bởi mapping master.

Preflight có **40 cảnh báo**: 7 nhóm ID trùng, 14 tham chiếu không khớp và 19 tham chiếu có nhiều ứng viên. Đây là số diagnostics theo trường, không phải 40 hồ sơ độc lập. Chưa có resolver toàn chuỗi tài chính. Bộ đếm tìm 474 Drive ID từ 2.087 tham chiếu theo phạm vi/thuật toán mới, có thêm approval packages; không so trực tiếp với 465/1.939 ở kiểm kê cũ và không coi là file đã tải.

Đã tạo pg_dump custom, SHA-256 và manifest trong `backup/`; restore sang **dgc_migration_staging_restore_20261019** giữ đúng 3.154 hàng nguồn, 14 mapping, 10 dịch vụ, 4 đối tác, không có Invoice/cash entry vận hành. Đây là backup trước import contracts, được giữ lại. Backup bổ sung `dgc-contracts-20261019.dump` và `contracts-manifest.json` đã restore sang **dgc_migration_staging_restore_contracts_20261019**; kiểm tra lại đủ 3.154 hàng raw, 37 mapping, 10 dịch vụ, 4 đối tác, 9 hợp đồng, 14 liên kết, 9 decision audit, sáu thuế 0.1 và hai alias đúng; vẫn không có financial posting. Container thử chưa có chính sách vận hành/backup định kỳ; snapshot và dump riêng là nguồn phục hồi của đợt này.

## Công cụ migration đã triển khai

`scripts/dgc-migration.mjs` có ba lệnh:

```powershell
node scripts/dgc-migration.mjs prepare --cells artifacts/dgc-migration/20261019/cells --out artifacts/dgc-migration/20261019/prepared --decisions artifacts/dgc-migration/20261019/owner-decisions.json
node scripts/dgc-migration.mjs stage --snapshot <snapshot.json> --snapshot-hash <reviewed-hash>
node scripts/dgc-migration.mjs apply-masters --snapshot <snapshot.json> --snapshot-hash <reviewed-hash> --scope services --plan-hash <reviewed-plan-hash> --decisions <owner-decisions.json>
```

`DATABASE_URL` phải được cấp riêng trong tiến trình, chỉ chấp nhận localhost và tên DB `dgc_migration_staging_*`. Có đúng một tenant DGC. Chỉ ghi báo cáo riêng tư dưới `artifacts/`.

Migration additive bổ sung `dgc_import_snapshots`, `dgc_import_rows`, `dgc_import_links` và Prisma models tương ứng. Mỗi hàng giữ sheet ID/tên, số hàng, legacy ID, row hash, payload raw/display và snapshot hash. Liên kết tới target có target hash; replay từ chối nguồn bị sửa/di chuyển, đích bị sửa, khóa không có provenance, mapping mới khác hoặc checksum bị can thiệp. Company row lock và transaction bảo vệ import; audit cùng transaction. Mã hiện hỗ trợ import danh mục services/partners/contracts/contractServices; toàn scope bị chặn nếu còn vấn đề trong scope đó.

File decisions hỗ trợ **Status**, **Tax_Rate của contracts** và **Service_ID của contractServices** có xác nhận owner, lý do và khớp chính xác snapshot/hàng/hash/giá trị cũ. Phải cung cấp giá trị đích được xác nhận; không tự chia thuế cho 100, làm tròn hay đoán alias. Các kiểm tra tỷ lệ và phụ thuộc danh mục vẫn chạy sau mapping. Mọi import financial và di chuyển file vẫn cần implementation riêng.

## Invoice DGC đã có runtime riêng

Nguồn hành vi: donor v61 `40_Invoice_Core.js:363–465, 627–796`, `41_Invoice_PDF.js:10`, `80_Audit_Integrity.js:549`. Không sử dụng template pháp nhân GST cho DGC.

- Cấu hình Invoice tại Tài sản công ty: pháp nhân, địa chỉ/liên hệ, ngân hàng/SWIFT, tên và chức danh người ký. API `/api/v1/company/invoice-profile` yêu cầu SYSTEM_CONFIG_EDIT, đúng Origin/CSRF, expectedUpdatedAt, có phiên bản và audit. Không có ngân hàng/chữ ký/pháp nhân thật được tự điền hoặc upload trong đợt này.
- DGC yêu cầu **COMPANY_LOGO, COMPANY_STAMP, SIGNATURE** riêng, đọc đúng tenant và kiểm checksum; không dùng SIGNING_COMPOSITE của GST. Preview cho kéo dấu và chữ ký độc lập. Metadata snapshot giữ profile, từng asset ID/version/hash và vị trí; thay config/asset làm digest cũ hết hiệu lực.
- Numbering **01/MM/YYYY/DGC-INV**, ít nhất hai chữ số, sequence theo tháng. Quét số lớn nhất trong lịch sử Invoice cùng tenant, kể cả cancelled/superseded, kết hợp sequence để không cấp lại số đã nhập. Company lock, period lock và digest bảo vệ create/retry.
- Hạn thanh toán mặc định 45 ngày; giá trị 0 trong yêu cầu DGC cũng được hiểu là 45 theo `payload.paymentTermDays || 45` của donor. Ngày đến hạn hiển thị trong preview và snapshot.
- USD giữ hai chữ số, VND giữ số nguyên. Contract UI/API mặc định USD và chỉ chọn USD/VND theo phạm vi owner. MZN chỉ là thông tin nguồn PDF.
- Bundle in từng dịch vụ con theo donor; tổng nhóm lấy từ TOTAL. Điều chỉnh chênh lệch làm tròn vào dòng cuối theo helper donor, chặn dòng âm. Khác quy tắc parent-only riêng GST; nhánh GST vẫn dùng adapter cũ.
- Draft/PDF/workbook và scope tạo cùng transaction, rollback file khi DB thất bại. Draft không tạo AR. Issue tiếp tục dùng guard nguồn/permission/digest/one-AR của core; DGC bổ sung kiểm phiên bản nguồn từ lúc tạo PDF. Thay đổi nguồn yêu cầu tạo lại draft, không dùng lại PDF cũ. Không gửi email.
- UI phân trang 10 dòng cho chi tiết Invoice và tài sản công ty; kế thừa list Invoice/AR và các guard thanh toán hiện có.

Thích ứng công khai: renderer pdf-lib giữ các trường nghiệp vụ donor nhưng bố cục được dựng lại; hỗ trợ phân trang thay vì `overflow:hidden` của HTML donor. Tên/chức danh là text cấu hình, dấu và chữ ký là hai ảnh nguyên gốc như donor Invoice. Workbook XLSX DGC là bản xuất bổ sung, giữ decimal dưới dạng chuỗi chính xác, không chạy macro; không giả là workbook gốc của DGC. Chưa nghiệm thu mẫu pháp nhân/chữ ký thật hoặc thao tác UI trên trình duyệt.

Đối soát đầu ra đã có signing policy riêng DGC theo cập nhật bên dưới. InputRecon/AP/PDF, SOA và mapping đầy đủ quyền Staff/Manager/BOD chưa hoàn tất. Invoice cancel/tạo lại sau phát hành chưa thanh toán, draft tham chiếu song song giữa hai chế độ billing, SOA as-of, lịch sử cash và file gốc vẫn thuộc phần việc tiếp theo; xóa draft không thay chức năng cancel đã phát hành.

## Ký đối soát DGC bằng một ảnh ghép — cập nhật owner 19/10

Owner cho phép ghép dấu, chữ ký và chức danh thành **một hình chèn duy nhất**; đây là thay đổi được xác nhận so với ba ảnh kéo độc lập của donor v61. Trong Tài sản công ty, chọn Xem ảnh ghép từ COMPANY_STAMP, SIGNATURE và SIGNER_TITLE_NAME, kiểm tra PNG, nhập lý do rồi Lưu và dùng ảnh ghép. Cũng có thể upload SIGNING_COMPOSITE đã chuẩn bị cho chính tenant DGC. Invoice DGC vẫn dùng dấu/chữ ký riêng theo adapter Invoice.

- Preview không ghi tài sản. Bản ghép có nền trong suốt, không xóa nền trắng của ảnh nguồn, không vẽ lại chữ ký; giữ byte gốc của ba ảnh. ID/version/checksum nguồn và layout DGC_COMPOSITE_V1 nằm trong audit COMPANY_ASSET_COMPOSE. Lưu kiểm source digest và expectedCurrentId dưới company lock; stale source/foreign tenant/tamper bị chặn, lỗi audit rollback cả DB và file.
- DGC dùng mode **DGC_COMPOSITE** cho mọi partner, kể cả key DIGICOM; không áp dụng quy tắc ký số DIGICOM của GST. Một ảnh được chèn tại cùng vị trí tương đối trên **mọi trang** nguồn, giữ crop box/rotation và PDF gốc; kiểm bounds từng trang, tối đa 12 trang. Trang trong control dùng để xem, không giới hạn trang chèn. Bản đã chốt giữ ID/version/checksum của composite và placement; tài sản mới không thay các PDF cũ.
- Direct finalize giữ RECON_APPROVE (capability Manager/BOD); preview/sửa vị trí sau duyệt cần thêm **RECON_RESTAMP** (capability BOD). Seed khai báo quyền mới cho ADMIN; chưa gán role/quyền hoặc tạo user thật. Mapping Staff/Manager/BOD đầy đủ còn pending. Sửa vị trí chỉ tạo phiên bản PDF, giữ nguyên Revenue/Reconciliation và số tiền.
- DGC ghi header/item đối soát mới bằng **USD từ kết quả đọc nguồn đã kiểm tra**; native VND chỉ theo luồng nguồn được hỗ trợ. MZN giữ trong JSON nguồn/approved snapshot để đối chiếu. Kiểm hợp đồng trùng tiền tệ USD/VND. Mẫu PDF GST VND xác định phần thực nhận GST bị chặn ở DGC. Không chạy lại công thức hoặc thay các số tiền lịch sử đã staging.
- Tọa độ chèn bám crop-box preview Poppler trong ERP, không mang offset hiệu chỉnh browser cũ của Apps Script sang renderer mới. Bố cục ba ảnh trong composite là derivative mới được xem trước; không tuyên bố tương đương pixel với ba ảnh donor.
- Kiểm thử Linux mới: **89** kiểm tra DGC composite/recon, **53** kho tài sản, **72** Invoice DGC và **264** hồi quy đối soát/Invoice/AR/payment GST đạt. Source hiện tại được biên dịch trong container, Prisma client được tạo từ schema hiện tại và mỗi suite dùng database fixture riêng. Đã render và xem cả bốn trang xoay 0/90/180/270 bằng Poppler; test pixel kiểm vị trí và mỗi trang chỉ có một XObject ảnh ký. Ảnh proof là hình chữ nhật fixture, không dùng ảnh ký thật. Chưa nghiệm thu thao tác UI bằng browser hoặc mẫu ảnh thật.

## Kiểm tra và phần tiếp theo

- Build toàn workspace Node 22/pnpm 10.18.3 đạt; migration trên các DB dùng thử đạt.
- Migration characterization và PostgreSQL integration: danh mục/quan hệ hợp đồng, replay, sửa nguồn/đích, hàng di chuyển, checksum, owner decision và rollback khi downstream lỗi; không phát sinh financial posting.
- DGC Invoice characterization: child expansion/rounding, numbering, ảnh ký tách biệt, trang dài, company/overlap guards. Windows integration đạt 66 assertions cho profile/version/quyền, draft/PDF/workbook, số lịch sử, nguồn thay đổi, rollback, issue/AR USD/VND.
- Đã render và xem trực quan PDF tổng hợp một trang, nhiều trang và preview thực tế qua API bằng Poppler. Các ảnh trong proof là hình chữ nhật fixture, không phải chữ ký thật.
- Linux Node 22/PostgreSQL/Poppler/Tesseract: **264** checks trong luồng chung đối soát–Invoice–AR/payment, **101** checks hợp đồng dịch vụ, **72** assertions DGC API gồm cả preview PNG và mặc định hạn thanh toán đều đạt. API được biên dịch từ source hiện tại trong container kiểm thử, DB fixture riêng; không dùng bản deploy hoặc DB GST.
- Ba kỳ vọng lỗi thời trong suite cũ được đối chiếu với code HEAD/donor trước sửa test: PDF mở inline; register AR chỉ liệt kê khoản còn dư; người có quyền được duyệt draft trực tiếp như UI hiện tại và donor generic status helper. Bổ sung kiểm tra quyền và direct-approval đúng hành vi. Không đổi nghiệp vụ runtime để chạy theo các kỳ vọng cũ.

Ưu tiên tiếp tục: (1) contracts/alias đã nhập staging, replay và restore đạt; (2) signing policy/ảnh ghép và guard sửa vị trí đã có, còn mapping đầy đủ từng role/action và nghiệm thu UI/ảnh thật; (3) port InputRecon/AP và SOA từ donor với fixture, ghi rõ as-of; (4) resolver và importer financial/file toàn chuỗi, đối soát lại theo tiền tệ/kỳ/đối tác; (5) nghiệm thu staging, cấp remote/host DGC đúng tài khoản rồi mới cutover. Chưa có dịch vụ, DNS hoặc production DGC được tạo trong đợt này.
