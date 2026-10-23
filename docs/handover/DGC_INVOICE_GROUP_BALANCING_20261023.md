# Invoice: điều chỉnh dòng con cuối theo donor

Ngày 23/10/2026. Chỉ có characterization và rollback trial; chưa nhập tài chính hoặc nghiệm thu vận hành.

## Nguồn và kết quả

Đã đọc trực tiếp donor v61, không chạy source hoặc hàm repair: `40_Invoice_Core.js` phần chọn/sắp dòng con và `DGC_adjustInvoiceDetailGroupsToBillingRows_` (630–689), `80_Audit_Integrity.js` `DGC_adjustInvoiceDetailLinesToHeaderTotals_` (549–563). Hash file khớp `docs/DGC_SOURCE_INVENTORY.json`: lần lượt `3594fb82f787076fbea823701a30564d464d6be7bc65210243703ecb4c87d46c` và `812f27d52d2f995121345132270de991efcb1ea57b441bb7489e4d206f19a899`.

Donor sắp theo Source_Recon_Detail_ID hoặc Revenue_ID (numeric/base locale order), làm tròn Number/EPSILON hai số, rồi điều chỉnh **riêng từng component Revenue/WHT/Payable của dòng cuối** để khớp TOTAL. Không suy Payable từ Revenue−WHT. Bản replay dùng chung ở `packages/db/prisma/dgc-invoice-balance.mjs` từ chối giá trị thiếu, âm, precision quá hai số, số ngoài giới hạn và thứ tự mơ hồ; kiểm thêm kết quả Decimal độc lập và tổng ba component.

Snapshot đã duyệt có 91 Invoice: 87 không mở rộng child, hai child-expanded đã khớp nguyên bản và hai có balancing tái hiện đúng. Invoice nguồn hàng 79, chi tiết 320/321/322 và revenue 387–390: dòng cuối giữ Revenue_USD thấp hơn source child đúng 0,01 USD; ba dòng khớp donor, các component/header/AR nguồn không bị đổi. Invoice hàng 57 cũng khớp phép tính nhưng còn lỗi cấu trúc, tiếp tục held. Không xem khớp arithmetic là bằng chứng PDF semantics hoặc nghiệm thu toàn bộ nghiệp vụ.

## Profile và kiểm tra

Profile V4 `DGC_CAPTURED_INVOICE_ROUNDING_V4` / `DONOR_GROUP_LAST_CHILD_BALANCING` riêng chỉ nhận trường hợp có đủ group/child/order/binding, header/AR/source checks, các revenue dependencies được strict hoặc rounding profile cũ cho phép. Chỉ cho phép các khác biệt identity dòng và source component đã được replay; AR hoặc lỗi tài chính khác vẫn chặn. Các profile strict/V1/V2/V3 không đổi, không sửa cells/amounts/owner decisions. V4 chỉ có một candidate: Invoice hàng 79.

Internal reader kiểm lại staged row hashes, toàn bộ revenue set/reconciliation/contract/partner, membership và thứ tự child, ba source components và ba captured components, arithmetic donor/Decimal, header/AR, target/provenance fingerprints. Xóa/đổi metadata hoặc rehash target không bỏ được các kiểm nguồn này. Reader không có route vận hành hoặc activation. Trial luôn CANCELLED/noncurrent, revenue/scope BLOCKED, local creator INACTIVE/no role/session, original PDF bytes kiểm trước/sau; không tạo approval, receipt hoặc cash.

- 46 assertions planner/replay: last-child/independent components, số và order không hợp lệ, immutable input, forged report/plan, AR/amount/status/line-order holds.
- 118 PostgreSQL/runtime assertions synthetic: đọc đúng, rehash/tamper/metadata/source/link guards, write failure, replay, PDF checksum và rollback đủ model counts.
- 32 assertions trên clone host riêng: một Invoice–AR/bốn revenue ghi/đọc thử, replay 0 created/1 unchanged, 37 master provenance giữ nguyên, footprint rollback khớp; 0 financial committed.
- Hồi quy V1/V2/V3: 96/104/118 PostgreSQL assertions đạt; 34 migration suites và API build đạt.

Private evidence: `artifacts/dgc-migration/20261023/invoice-balancing/{review,plan}.json`, `proof-*.json`, logs. DB nguồn thử `dgc_migration_staging_invoice_balance_source_synthetic` clone host finance có 3.154 raw rows thuộc full snapshot và 37 raw master rows riêng; không coi tổng 3.191 raw rows là source delta. Không đổi localhost guard hoặc master importer.

CLI `migration:prepare-invoice-balance`, `migration:verify-invoice-balance`, `migration:rehearse-invoice-balance` dùng cùng các snapshot/target/combined/Invoice manifest/restore/rounding/exception pins của các profile trước; verify/rehearse truyền `--balance-plan`, rehearsal thêm recon manifest/root và `--source-rows`. Không có commit path.

## Trạng thái và bước tiếp

Bốn Issued Invoice strict đã trial trước đó và một Issued Invoice V4 đã trial riêng; ba Issued khác (84/85/86) vẫn held bởi source/PDF/scope. Chưa phải một transaction gộp hoặc operational acceptance. Registry V1/V2 vẫn 36 dependencies/35 documents vì V3/V4 chưa ghép. Website đang v12; chưa triển khai V4 lên host.

Source `22685c6743f0a52061169f38456e4d9cd5cebd13` và generated release `01338c43f0304613b53bc69a4232637bb599c90b` đã push đúng hai nhánh DGC. Bundle root một app/121 files được tái tạo, Linux Docker build và Node 22 smoke kiểm shared arithmetic/internal reader import đạt; không donor records/secrets. Không redeploy host vì profile mới chỉ là internal trial reader, chưa có operational importer/route cần mở; không redeploy chỉ vì tài liệu audit. Proof release private ở `artifacts/dgc-deploy/20261023/invoice-balancing-release.json`.

Tiếp theo: hợp nhất các profile đã kiểm vào whole-document/full financial staging, giữ ba Invoice held trong danh sách đối chiếu, hoàn thiện operational importer/files/lifecycle và UAT trước cutover. Không promote các trial rows hoặc source Approved thành local approval.
