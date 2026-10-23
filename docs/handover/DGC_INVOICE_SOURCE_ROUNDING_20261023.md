# Invoice khớp dòng trình bày, có ngoại lệ ở nguồn con

Ngày 23/10/2026. Chốt phần kiểm đang làm trước khi chuyển ưu tiên sang [môi trường một website và cắt chuyển](DGC_SINGLE_SITE_CUTOVER_20261023.md).

Donor `40_Invoice_Core.js` cộng độc lập ba khoản của các dòng trình bày. Invoice có thể khớp cả header và từng dòng nhưng nhóm revenue bên dưới vẫn có Child lệch một cent do rounding đã characterize. Đây là trường hợp khác V1 header khác 0 và V2 line deltas trái dấu; không mở rộng hai profile cũ.

`invoiceSourceRoundingPlan` chỉ nhận Invoice mà lý do V1 duy nhất là `HEADER_LINE_ROUNDING_NOT_CHARACTERIZED`, mọi header/line delta đúng 0, đủ scope/source/AR/receipt/PDF gates, có nhóm source rounding và ít nhất một exception không xuất hiện trên Invoice. Metadata riêng `DGC_CAPTURED_INVOICE_ROUNDING_V3`, `headerArithmetic=EXACT_PRESENTED_LINES_WITH_SOURCE_ROUNDING`, cùng `sourceRevenueSet` đủ mọi Total/Child trong các nhóm.

Reader tái dựng tập nguồn từ staged rows theo document/partner/contract/period/currency của Total roots; so khớp metadata, đọc từng revenue bằng reader thật, kiểm target cùng reconciliation và đủ tập targets/sourceLifecycles. Không thể bỏ qua Child chỉ vì nó không có dòng Invoice. V1/V2 tiếp tục giữ yêu cầu riêng. Không thêm endpoint, role hoặc activation path.

Kết quả:

- API build, 32 migration suites (23 assertions mới) đạt.
- 118 PostgreSQL assertions mới: một Total/ba Child, header 100/10/90, một dòng trình bày delta 0, hai Child ±0,01; giữ Paid/AR 90/90/0 và source receipt evidence, không payment/cash. Kiểm metadata/version/set tamper, thiếu provenance Child, staged Child payload, AR/target/PDF drift, replay và full rollback.
- Hồi quy đạt: Invoice V2 PostgreSQL 104, V1 PostgreSQL 96, source reader 94 và revenue rounding reader 30.
- Snapshot thật chọn duy nhất Invoice row 21: **một Invoice–AR, sáu nhóm/chín revenue**; reader đọc đủ 1/9, replay 0 trùng, 23 model counts rollback khớp. Staging nguồn 19 migrations/3.154 raw/37 links/0 financial giữ nguyên. Actual copy và synthetic copy mới đều 24 migrations, không thêm schema migration; synthetic trở về trống.
- CLI verify source rounding và V2 cũ đạt; V2 pin `3fd92c...` và original V1 pin không đổi.

Private outputs `artifacts/dgc-migration/20261023/invoice-source-rounding/`. Plan hash `ab0712cd1bb7febe4dbaeee3202a81173a7d14d9405d8a1edb27ac99e707a110`; rehearsal digest `ebc9c809057e475835d6a25423f64aad5e298d7cfa3e86957d8499d03d189f47`; whole runtime-proof digest `462957592c6f755f51fda214d18b2501fb9dedf52d320e09af2b29faa7dd5964`.

DB actual `dgc_migration_staging_invoice_source_rounding_20261023`; synthetic `dgc_migration_staging_invoice_source_20261023_synthetic` (tên ngắn để không bị PostgreSQL cắt 63 ký tự). Các sửa payload trong fault test được rollback bằng savepoint để không ghi lại serial ngày qua JSON serialization của Prisma.

CLI `migration:prepare-invoice-source-rounding`, `migration:verify-invoice-source-rounding`, `migration:rehearse-invoice-source-rounding` dùng inputs Invoice rounding hiện có, thêm `--source-rounding-plan` khi verify/rehearse; rehearsal nhận `--source-rows all-candidates`, roots và manifests Invoice/recon như cũ. Không có commit path.

Chưa ghép profile V3 vào whole-document registry; worklist vẫn 36 dependencies/35 documents có refs và 31 package no-ref. Chưa financial import/cutover. Ưu tiên tiếp theo theo chỉ đạo owner là dựng đúng môi trường DGC một website, hoàn tất đường nhập staging/đối chiếu/UAT; không tiếp tục chia thành nhiều đợt ngoại lệ nhỏ trước đường găng này.
