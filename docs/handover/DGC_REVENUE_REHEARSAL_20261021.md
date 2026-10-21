# Diễn tập ánh xạ đối soát → doanh thu — 21/10/2026

Đã có planner nhóm nguồn và công cụ **ghi thử PostgreSQL, replay rồi bắt buộc rollback**. Đã diễn tập trên bản phục hồi riêng của snapshot thật: 169 nhóm / 205 revenue, không tạo trùng khi replay và không giữ lại financial record nào. Đây là kiểm tra ánh xạ/ràng buộc DB, chưa phải importer được phép commit hoặc nghiệm thu runtime tài chính.

## Bằng chứng thật và phạm vi

Backup `dgc-contracts-20261019.dump` được kiểm SHA-256 `c356ce3d6071a85e618589c750157146e1f3d9863b46e0e6a8983dc5204ad464`, phục hồi sang **dgc_migration_staging_revenue_rehearsal_20261021** trên container DGC cổng 55433. Chỉ bản phục hồi này và DB fixture `dgc_migration_staging_revenue_20261021_synthetic` được áp dụng migration mới. Không sửa DB snapshot gốc, DB restore cũ hoặc GST.

Planner giữ đủ 409 revenue trong **265 nhóm PDF vật lý + partner + contract + kỳ + tiền tệ**:

| Kết quả planner | Nhóm | Revenue |
| --- | ---: | ---: |
| REHEARSABLE | 169 | 205 |
| HELD | 96 | 204 |

HELD là giữ cả nhóm, không chọn riêng dòng sạch để bỏ qua CHILD hoặc ngoại lệ cùng PDF/hợp đồng. Vì thế 294 dòng vượt kiểm cấu trúc ở report trước không đồng nghĩa 294 dòng được đưa vào diễn tập. Các nhóm thiếu/mâu thuẫn legacy Recon, khác lifecycle, không đủ Total/Y hoặc parent, không có file reference, trạng thái PDF chưa phù hợp và số tiền còn chênh lệch đều bị giữ. Chưa giải quyết hoặc thay quyết định owner về các link Invoice đang chờ.

Trong transaction thật của 169 nhóm:

- Lượt đầu: 169 Reconciliation, 205 ReconciliationItem, 205 Revenue; tất cả BLOCKED, không current. Không tạo local approver, approval timestamp hoặc tài khoản người dùng.
- Lượt replay trong cùng transaction: **0 bản mới, 205 revenue unchanged**. UUID và khóa thử xác định theo company + nguồn; hash kiểm dữ liệu/quan hệ/metadata, không chỉ đếm dòng.
- 169 dòng TOTAL/Y đóng góp header; 36 CHILD giữ trong chi tiết, không cộng thêm vào tổng. Hai cơ sở tiền management và Invoice USD giữ riêng.
- Mapping tạm 37 → 242, audit 47 → 216. Sau rollback trở về **37 và 47**; reconciliation/item/revenue trở về **0**. Invoice, scope, AR, receipts, InputRecon/AP, quỹ, cash history/entry/transfer, attachment/document đều **0 trước/trong/sau**.
- `sourceCaptureVerified=true`: raw revenue round-trip còn đúng row hash; replay kiểm cả metadata nguồn. `filesVerified=false`, `postingAllowed=false`, `acceptance=false`.

Đã đọc lại DB snapshot gốc sau diễn tập: 3.154 raw rows, 37 provenance links, 0 revenue/Invoice/cash entry. Financial import thật vẫn chưa chạy.

Report private, Git ignore:

- `artifacts/dgc-migration/20261021/revenue-target-plan.json` — planHash `fd9d7dc0de5a59a2ef2d411f0c0c572a4ec614b0688e1c714676fa67cb928a22`.
- `artifacts/dgc-migration/20261021/revenue-rehearsal-all-proof.json` — footprint, replay và số tiền từng target trước rollback. Có thêm proof một nhóm/4 revenue từ lần thử ban đầu.
- SnapshotHash vẫn `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.

## Khác biệt nghiệp vụ vừa xác minh

Đã đọc donor `20_Recon_Core.js:createReconciliationFromRevenue`, `importReconPdfToReconciliation` khoảng 1006–1094 và approve; đọc lại `30_Revenue.js:importReconPdfToMonthlyRevenue` cùng runtime Reconciliation/Revenue/recon-finalize.

`41_RECONCILIATION` có hai cách tạo khác nhau. Đường copy revenue dùng các trường management cùng cơ sở với revenue. Đường nhập PDF dùng **Gross_Revenue = Total_Service_Revenue_MZN, Net_Revenue = Service_Revenue_For_Sharing_MZN, Partner_Share = Partner_Revenue_MZN**, còn **Company_Share/Recon_Amount = Partner_Revenue_USD**. Không được coi ba số đầu là USD hoặc ép chúng bằng trường cùng tên trong `40_MONTHLY_REVENUE`. Snapshot có 406 hàng khớp characterization PDF này; các trường hợp không khớp vẫn giữ để đối chiếu.

Planner ghi các characterization khớp thành danh sách, không chọn bản đầu nếu nhiều cách cùng khớp. MZN được so sánh như bằng chứng capture với capture, lưu nguyên trong raw metadata; không chuyển đổi, ghi vào model money vận hành hoặc mở workflow MZN. Amounts model thử lấy từ management USD của revenue; ba số Invoice USD nằm trong calculation metadata riêng. Header dùng Company_Share của TOTAL/Y, không cộng số MZN trong legacy Recon.

Điểm thứ hai: Prisma JSON serialization làm đổi phần lẻ một số serial ngày nguồn khi gửi nested numeric JSON, khiến replay phát hiện hash khác. Đã giữ các capture gốc dưới dạng **chuỗi canonical JSON** trong metadata (`documentJson`, `capturedRevenueJson`, `legacyReconciliationsJson`), không nới checksum hoặc làm tròn ngày. Money mapping dùng chuỗi Decimal. Khi sử dụng lại evidence, parse chuỗi rồi kiểm row hash; không thay các chuỗi này bằng object số gửi qua serializer mà chưa kiểm fidelity.

## Guard và phần chưa phải mapping cuối

`revenue-target.mjs` dựng lại [report doanh thu](DGC_REVENUE_MIGRATION_20261021.md) và reference graph; source/owner decisions phải đúng snapshot/hash. Mỗi group yêu cầu đủ revenue và đúng một legacy Recon liên kết rõ cho từng dòng, status phù hợp, basis số tiền có bằng chứng. CHILD phải có đúng một parent TOTAL/Y trong nhóm. Cấm trùng TOTAL service; header tổng cũng kiểm Decimal(20,4), không chỉ từng dòng.

`revenue-rehearsal.mjs` chỉ nhận nguyên group REHEARSABLE, expected plan hash và local `dgc_migration_staging_*` URL. Kiểm database thật bằng current_database(), đúng một tenant DGC, khóa company, đủ raw snapshot và master source/target hashes. Master provenance từ snapshot trước chỉ được dùng khi cùng sheet/row/legacy ID/row hash và target/mapping còn khớp snapshot hiện tại; không tự áp quyết định chủ sở hữu sang snapshot khác.

Trong transaction Serializable: dựng target → kiểm lại nguồn/master → replay → kiểm downstream footprint và raw evidence → throw tín hiệu rollback riêng. Không có tham số commit hoặc hàm public ghi tài chính lâu dài. Audit/mapping cũng cùng transaction. Sau rollback kiểm footprint bằng trước; lỗi không được trả như thành công.

Đây là **ánh xạ thử phần management**, chưa phải đối soát nghiệp vụ runtime đầy đủ. Target dùng BLOCKED + isCurrent=false, sourceType SYSTEM_IMPORT, revision kỹ thuật 1 và mã DGC-TRIAL cho reconciliation. Source status/actor/ngày/mã legacy được giữ trong evidence, không giả làm local approval. WHT vận hành của basis management đã là payable giữ 0 theo cách runtime PDF hiện dùng; Invoice WHT giữ riêng trong metadata. Chưa gắn file bytes/Attachment, contract-service snapshot, revision lịch sử, actor/date đích hoặc khởi tạo nguồn OutputReconUpload đã duyệt. Không dùng các target thử này làm nguồn InputRecon/Invoice hoặc xem trạng thái BLOCKED là trạng thái đã chuyển cuối cùng.

Phạm vi rehearsal hiện chỉ USD của snapshot này; VND bị giữ để ánh xạ sau, không suy FX. Runtime DGC vẫn có phạm vi USD/VND theo owner.

Migration additive `20261021001000_dgc_revenue_import_provenance` chỉ mở rộng CHECK target_model của dgc_import_links để nhận revenue, giữ bốn loại master cũ và mọi khóa/FK. Không backfill, đổi trạng thái hoặc tạo financial record. Schema/migrations trên DB copy được giữ để kiểm tra tiếp; chỉ các bản ghi thử trong transaction được rollback.

## Chạy lại và kiểm chứng

```powershell
node scripts/dgc-migration.mjs prepare-revenue-target --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<target-plan.json>
node scripts/dgc-migration.mjs verify-revenue-target --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<target-plan.json>
# DATABASE_URL trỏ bản staging copy đã stage nguồn, có master provenance và đủ migrations.
node scripts/dgc-migration.mjs rehearse-revenue --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<target-plan.json> --plan-hash <sha256> --group-keys <hash1,hash2> --out artifacts/<rehearsal-proof.json>
pnpm test:migration
# Chỉ database disposable *_synthetic, không dùng DB có nguồn thật:
pnpm test:migration:revenue-staging
```

Mười suite migration đạt; suite target cuối cùng **48 assertions**. PostgreSQL integration đạt **217 assertions**: nhóm Total/Child, hai cơ sở tiền, replay/no-op, rollback cả audit/link, lỗi trigger giữa transaction, source/master/target drift kể cả sau lượt ghi đầu, khóa có sẵn không provenance, sai DB URL/tenant, source fractional-date fidelity và tái dùng master không đổi giữa snapshot. Migration deploy đã đạt trên DB fixture và bản backup phục hồi. Không đổi runtime/API/UI; chưa nghiệm thu hành vi phát hành chứng từ trên dữ liệu đã nhập.

Tiếp theo: xác minh/cất giữ PDF đối soát gốc, xử lý nhóm HELD, hoàn thiện target lifecycle/revision/actor/date và chuỗi Invoice/payment/AR trước khi có đường commit được nghiệm thu. InputRecon Generated chưa duyệt, ngoại lệ 0,5 VND, SOA cutoff, timezone và role provisioning vẫn theo bàn giao trước. Không push/deploy hoặc thay GST.

Đã tiếp tục [custody PDF đối soát ngày 21/10](DGC_RECON_FILES_20261021.md): 261/266 file có bản sao/size/SHA-256, năm ID chưa truy cập được. Trong 169 nhóm đã rehearsal, 166 nhóm/202 dòng có bytes nguồn để review tiếp. Manifest còn partial; file verification chưa là semantic/financial acceptance hoặc thay đổi trạng thái HELD.
