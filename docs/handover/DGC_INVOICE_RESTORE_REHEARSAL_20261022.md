# Diễn tập khôi phục Invoice và AR lịch sử

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục [PDF nguồn trong runtime](DGC_RECON_PDF_RUNTIME_20261022.md) và [InvoiceScope](DGC_REVENUE_SCOPES_20261022.md). Đã có blueprint đủ 91 Invoice và **diễn tập PostgreSQL thật cho bốn Invoice/AR**, replay không trùng và rollback toàn bộ. Chưa có committing importer hoặc financial activation.

## Phân loại và kết quả nguồn thật

| Nhánh | Số Invoice |
| --- | ---: |
| Đủ gate hiện có để thử rollback | 4 |
| Còn đối chiếu tài chính/scope/evidence | 49 |
| Superseded/Cancelled, giữ archive riêng | 33 |
| Nháp, chưa khôi phục AR | 5 |

Planner `invoice-restore.mjs` dựng lại scope/history từ snapshot và combined-review pin; không dùng báo cáo đã tự sửa trạng thái. Candidate cần toàn Invoice qua exact finance, scope, source Revenue status, business/evidence gates; không lấy một dòng sạch để mở cả consolidated Invoice. PDF manifest phải đủ đúng 91 physical Invoice rows, file ID/hash/path/size hợp lệ và có external manifest pin. Blueprint chưa đọc bytes, nên vẫn `filesVerified=false`; rehearsal kiểm bytes trước và sau ghi thử.

Private plan `artifacts/dgc-migration/20261022/invoice-restore/plan.json`, hash **`7ee9be18858a3f89d5f402ff45ebb1086f03bb0c944f448eca6787dc90534904`**. Manifest Invoice pin không đổi: `dc7739817c07f064d2a5bc00d48a36e80eb94f3b18cdc02912bac796a1ab3f68`; combined pin `e74526ef5a7baf1b6ffc8bc22029603f7c2f5d1d2b8b12a986eb88702ca4cf52`. CLI verify dựng lại toàn plan đạt.

DB thử **`dgc_migration_staging_invoice_restore_20261022`**, copy từ DB revenue rehearsal đã phục hồi riêng; container DGC loopback 55433. Bốn candidate đã tạo thử:

- Bốn Reconciliation/Item/Revenue, bốn Invoice, bốn contract scopes/Total items và bốn AR. Raw Invoice/details/AR/payment giữ canonical JSON strings, source hashes và toàn bộ số tiền captured.
- Bốn Attachment/Document **evidence metadata** trỏ original files đã kiểm hash; không copy, sửa hoặc regenerate bytes. Document DRAFT, type/entity riêng `DGC_REHEARSAL_EVIDENCE`/`DGC_INVOICE_REHEARSAL`, storageProvider riêng `DGC_REHEARSAL_EVIDENCE`; chưa phải Document INVOICE hoặc storage object vận hành để user tải qua Invoice thông thường.
- Mười hai provenance links (bốn Revenue, bốn Invoice, bốn AR) và tám trial audit entries, đều cùng transaction.
- Một technical creator INACTIVE, không role/session, chỉ tồn tại trong transaction để đáp ứng FK createdById. Không gán email nguồn sang local approver, không tạo issuedBy/issuedAt hoặc approval của nguồn. Actor này cũng rollback.

Replay tạo **0 Invoice mới**, nhận lại bốn record không đổi. Sau rollback, cả **22 nhóm bảng được theo dõi** trở về đúng trước thử; copy và staging snapshot gốc đều còn 3.154 raw rows/37 master links/0 Invoice/0 Revenue/0 cash entries. Copy còn 0 AR. Báo cáo private `rehearsal.json` và `verification.json` giữ footprint và so sánh Invoice/AR amounts với nguồn.

`filesVerified=true` trong report trial có scope rõ **ORIGINAL_INVOICE_PDFS_ONLY**. Không đọc lại recon PDFs trong transaction này (`reconFilesReverified=false`); phần recon evidence dùng combined review đã ghim từ các bước trước. Không lấy kết quả trial này để tự nghiệm thu toàn chuỗi hoặc bỏ kiểm recon bytes khi làm operational import.

**Không tạo InvoicePayment, bank/cash accounts, cash movement, AP/InputRecon hoặc document-reference registry.** Khoản thu nguồn chỉ giữ trong capturedPaymentsJson; chưa dựng payment approval rows hoặc phân bổ thu cho từng contract/Child. Không nhận cash flow từ các transaction mirror nguồn.

## Trạng thái trial và thay đổi schema

PostgreSQL CHECK hiện tại không nhận status tự đặt cho Invoice. Trial dùng **CANCELLED/isCurrent=false** cho Invoice và CANCELLED cho AR; scope BLOCKED/isCurrent=false, scope item không current, Revenue/Reconciliation BLOCKED như rehearsal trước. Đây là trạng thái kỹ thuật **chỉ trong transaction thử**, không có nghĩa đã hủy Invoice nguồn; source Status/Is_Current/actor/date vẫn nguyên trong canonical evidence. Không nới Invoice status CHECK. AR không hiện trong báo cáo current vì Invoice không current; Invoice download thông thường cũng không mở các bản thử.

Blueprint lưu proposed operational status riêng, chưa kích hoạt. Source Overdue trong fixture được giữ nguyên trong raw evidence, chỉ đề xuất stored ISSUED theo schema/runtime hiện hành, không tính Overdue theo ngày chạy. Nguồn thật đợt này không có Overdue. Ngày Invoice/due date là source calendar dates; timestamp duyệt/phát hành không được đoán từ timezone hoặc điền giờ nhập hiện tại.

Thêm migration **`20261022001000_dgc_invoice_import_provenance`**: mở rộng whitelist DgcImportLink đúng hai target models `invoice`, `accountReceivable`; giữ FK/unique/hash constraints, không backfill hoặc sửa financial rows. Chỉ áp migration vào **hai DB Invoice trial mới** (copy và synthetic); chưa áp vào staging gốc, DB revenue rehearsal nguồn hoặc môi trường vận hành. Schema support không đồng nghĩa business parity hoặc cho phép financial import.

## Guard và kiểm thử

`invoice-rehearsal.mjs` chỉ có đường rollback, không nhận commit flag. Dùng staging/master checks và deliberate rollback của revenue rehearsal; ghi Invoice/AR trước khi outer transaction abort. Chọn source rows phải unique, complete và thuộc candidate; draft/archive/held hoặc stale/rehashed plan bị từ chối. Original Invoice files được kiểm lại trước/sau trial; không có renderer/fallback GST.

Replay so cả hash target và provenance. Thiếu child target/provenance sau lần đầu bị từ chối, không tự sửa/nhận adoption. Invoice number có sẵn mà không có trial provenance cũng bị chặn. Actor không được trùng một tài khoản có sẵn. Lỗi ghi AR, target drift hoặc file tamper đều rollback; kiểm footprint kể cả khi trial lỗi.

**21 suite migration đạt**, suite blueprint mới **129 assertions**. **56 PostgreSQL assertions** trên `dgc_migration_staging_invoice_restore_20261022_synthetic`: actual materializer, paid historical amounts, Total-only scope item với Child presentation, replay, injected AR failure, target amount drift, missing scope item, PDF tamper, disabled actor/no role/session/cash và rollback toàn bộ. Fixture setup cũng nằm trong outer transaction; DB synthetic về trống. Source floats như `46245.657010740746` giữ nguyên trong JSON strings. Các trial đầu đã chỉ ra Invoice status CHECK và provenance whitelist còn thiếu; code/migration xử lý theo hai phần trên, không bỏ constraint hoặc sửa dữ liệu nguồn.

```powershell
node scripts/dgc-migration.mjs prepare-invoice-restore --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<revenue-target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --manifest artifacts/<invoice-files-manifest.json> --manifest-hash <sha256> --out artifacts/<restore-plan.json>
node scripts/dgc-migration.mjs verify-invoice-restore <same inputs> --restore-plan artifacts/<restore-plan.json>
# Chỉ local dgc_migration_staging_* đã chuẩn bị; luôn rollback:
node scripts/dgc-migration.mjs rehearse-invoice-restore <same inputs> --restore-plan artifacts/<restore-plan.json> --root artifacts/<source-invoices> --source-rows <physical-rows> --out artifacts/<trial-report.json>
pnpm test:migration
pnpm test:migration:invoice-staging
```

Tiếp tục: operational historical acceptance/source guard và original-attachment promotion; actor/date policy cho phát hành và payment lịch sử; Invoice revision family/scope UUID mapping; registry SOA/approval-package references trước khi cho cancel. Chưa tự áp ba financial-link proposals, nhập 49 Invoice held, tạo AR từ nháp hoặc mở cash ledger. Reporting timezone, SOA cutoff và real-user role provisioning vẫn theo bàn giao. Không push/deploy.
