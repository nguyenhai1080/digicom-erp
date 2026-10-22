# Diễn tập đăng ký tài liệu–Invoice lịch sử

Ngày 22/10/2026. Tiếp sau [custody 77 PDF SOA/package](DGC_REFERENCE_FILES_20261022.md). Đợt này thêm dependency closure planner và diễn tập PostgreSQL **dữ liệu giả lập**, không đăng ký tài liệu nguồn thật hoặc kích hoạt Invoice.

## Kết quả

- **24 suite migration đạt**, trong đó planner có **19 assertions** mới.
- **76 PostgreSQL assertions đạt**: hai Invoice/AR từ hai kỳ độc lập, một SOA Draft và một package nguồn Approved, mỗi tài liệu đăng ký đủ hai Invoice. Tổng bốn registry links; replay tạo 0 documents/links.
- Đã gọi guard runtime thực tế `assertInvoiceUnused` lần lượt khi chỉ giữ SOA links và khi chỉ giữ package links. Cả hai Invoice đều bị chặn ở từng trường hợp; source SOA Draft không bị loại khỏi guard.
- Inject lỗi sau link đầu tiên của một tài liệu hai Invoice: transaction/savepoint rollback sạch. Missing link/kind drift/DRAFT→ACTIVE drift và PDF tamper bị từ chối; không repair replay để che thiếu liên kết. Chạy lại sau lỗi vẫn tạo mới đúng hai documents/bốn links rồi rollback.
- SOA nguồn Draft và package nguồn Approved đều chỉ tạo **Document DRAFT** trong shape trial; createdById/documentDate null. Source header, actor/date/raw serial/status giữ canonical JSON trong audit; không giả source approver thành người dùng local.
- Không tạo local approval request, payment, AP, cash/bank, transfer, role hoặc session. Toàn bộ fixtures, masters/staged rows và trial targets rollback về 0 sau outer transaction.

DB mới duy nhất được tạo/cập nhật trong đợt: **`dgc_migration_staging_reference_20261022_synthetic`**, clone từ DB Invoice synthetic trống, DGC container `dgc-erp-acceptance-postgres`, loopback 55433. Chỉ DB này áp migration `20261022002000_dgc_document_import_provenance` (tổng 24); migration chỉ bổ sung `document` vào provenance whitelist. Không bỏ constraint của Invoice/Document/registry và không chạy seed.

Kiểm SQL sau thử: DB mới company/Invoice/Document/registry đều 0; DB Invoice snapshot-copy vẫn 0 Invoice/0 registry và 23 migrations; staging gốc vẫn **3.154 raw/37 provenance/0 Invoice/0 revenue/0 cash**, 19 migrations, không bị nâng schema. Không thao tác DB/container GST.

## Snapshot thật: chưa có tài liệu hoàn chỉnh đủ điều kiện trial

Planner đọc đủ 77 documents, rederive Invoice restore plan và reference review từ snapshot, kiểm lại 77 original reference PDFs theo manifest pin rồi yêu cầu **toàn bộ tập Invoice của từng tài liệu** vượt gate restore.

- 46 documents có Invoice references: tất cả còn ít nhất một dependency held. Hai trong số này có chứa một phần trong bốn Invoice candidate hiện tại; không được tách bớt Invoice để nhập partial document/package.
- 31 package không có source Invoice list: giữ `NO_CAPTURED_INVOICE_REFERENCES`, không suy liên kết hoặc tạo registry trống rồi coi đã chuyển.
- Output hiện có 77 `REGISTRATION_HELD`, **0** whole-document candidates. Đây là gate registration, không phủ nhận kết quả byte custody đầy đủ.
- Có **46 Invoice riêng biệt** đang chặn các document sets. Trong các blockers: 46 có `REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD`, 38 có `CAPTURED_FINANCE_REQUIRES_REVIEW`, 39 có `REVENUE_FINANCIAL_STATE_REQUIRES_REVIEW`, năm có `SCOPE_BINDING_REQUIRES_REVIEW`. Các nhóm lý do có giao nhau, không cộng thành số Invoice.
- `unrehearsableInvoices` giữ địa chỉ/hash Invoice, toàn bộ restore reasons và danh sách document bị ảnh hưởng, sắp theo số dependencies giảm dần (cao nhất ba documents). Đây là hàng chờ xử lý có thể truy ngược, không phải quyết định sửa số tiền/trạng thái nguồn.

Private plan: `artifacts/dgc-migration/20261022/reference-registration/plan.json`.

Plan pin: **`01286093f39907abe9dddaab22eea2bb179fe6f5de79849f1c396aa5d95ccfda`**.

`cli-guard-proof.json` xác nhận lựa chọn SOA thật held đã bị từ chối **trước khi kết nối DB**; thử bằng localhost port không có DB, không tạo report trial hoặc Invoice/documents thật. Không áp migration mới cho DB snapshot-copy thật chỉ để chạy một lựa chọn không đủ điều kiện.

## Cách triển khai

- `reference-registration.mjs` không cung cấp commit path. `rehearseReferenceRegistration` dùng staging/whole-snapshot/master checks của revenue rehearsal, Invoice/AR materializer có sẵn, sau đó tạo Document/Attachment metadata/provenance/registry đầy đủ trong cùng transaction và cố ý rollback. File gốc chỉ đọc/hash, không copy/promote sang storage vận hành.
- Replay kiểm target hashes, source links và chính xác toàn bộ tập registry/kind. Partial/missing/extra/drift không được nhận làm trạng thái hoàn thành hoặc tự chữa. Đếm footprint trước/trong/sau trên 23 nhóm bảng; mọi failure cũng phải rollback.
- Tài liệu trial nhận `entityType=DGC_REFERENCE_REHEARSAL`, storage `DGC_REHEARSAL_EVIDENCE`; Invoice vẫn CANCELLED/non-current và scope/revenue BLOCKED/non-current như Invoice rehearsal, không đổi thành operational.
- Shape trial ghi registry để kiểm FK/atomicity/guard. **Không thay hoặc nới `linkInvoiceDocuments`**: helper vận hành vẫn yêu cầu ACTIVE document và current operational Invoice. Future production importer phải có adapter lifecycle/acceptance phù hợp và gọi helper trên toàn bộ tập Invoice trong transaction trước khi mở cancellation. Thử registry trên DRAFT không phải API/luồng nhập thật mới.
- Unit tests không cần DB. PostgreSQL suite yêu cầu database trống tên `dgc_migration_staging_reference_*_synthetic` và bản build API để import guard thực tế (`pnpm --filter @erp/api build` khi chưa có dist). Đợt này API source không đổi; dùng guard dist đã có và kiểm hành vi bằng DB thật, không build lại ứng dụng.

Các lệnh CLI:

```text
pnpm migration:prepare-reference-registration ... --out <private-plan.json>
pnpm migration:verify-reference-registration ... --registration-plan <private-plan.json>
pnpm migration:rehearse-reference-registration ... --registration-plan <private-plan.json> --root <original-invoice-root> --documents <sheet:row,sheet:row> --out <private-trial.json>
pnpm test:migration:reference-staging
```

Các input chung: `--snapshot/--snapshot-hash`, `--plan` revenue target, `--review/--review-hash` recon combined gates, `--manifest/--manifest-hash` original Invoice PDFs, `--restore-plan`, `--decisions` nếu có; thêm `--reference-review/--reference-review-hash`, `--reference-manifest/--reference-manifest-hash`, `--reference-root`. Mọi file output ở private artifacts. Verify tái tính toàn bộ plan thay vì tin flags trong file; sửa rồi tự hash lại vẫn bị từ chối.

## Tiếp tục

Ưu tiên kiểm từng Invoice blocker cùng nhóm revenue/đối soát nguồn, bắt đầu những Invoice ảnh hưởng nhiều documents và các lỗi có thể làm rõ từ evidence. Giữ các chênh lệch/tham chiếu đang chờ owner; không nâng gate vì có đủ PDF hoặc vì chạy test đạt. Sau khi một whole document set đủ điều kiện mới rehearsal snapshot thật, rồi hoàn tất operational historical adapter/activation, receipts và kiểm tổng tiền toàn chuỗi. SOA cutoff, timezone, full user provisioning và môi trường DGC riêng vẫn pending; không cần tự chọn để làm công việc evidence độc lập.
