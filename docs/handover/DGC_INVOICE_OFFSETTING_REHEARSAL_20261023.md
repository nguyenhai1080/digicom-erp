# Diễn tập Invoice có sai lệch làm tròn trái dấu

Ngày 23/10/2026. Tiếp sau [Invoice rounding V1](DGC_INVOICE_ROUNDING_REHEARSAL_20261022.md) và [registry trial](DGC_REFERENCE_ROUNDING_REHEARSAL_20261023.md). Đã hoàn tất trial riêng cho ba Invoice; chưa ghép profile này vào SOA/package hoặc nhập tài chính chính thức.

## Bằng chứng và triển khai

Donor v61 `40_Invoice_Core.js`, khoảng dòng 786–812, cộng Revenue/WHT/Payable độc lập rồi làm tròn từng tổng. Header có thể khớp phép trừ trong khi các dòng có sai lệch trái dấu bù nhau. Giữ nguyên từng component, không tính lại Payable để ép identity.

`invoice-offsetting.mjs` rederive Invoice V1, characterization, scopes và revenue exception từ nguồn ghim hash. Chỉ nhận Invoice có lý do V1 duy nhất `HEADER_LINE_ROUNDING_NOT_CHARACTERIZED`, header/tổng line delta đúng 0, các kiểm tra khác đạt, có cả delta dương/âm trên dòng trình bày được characterize và bind Total/Child đầy đủ.

Snapshot thật chọn physical Invoice rows **2, 23, 27**: ba candidates/88 ngoài profile. 88 không phải số blockers hiện hành. Row 21 vẫn giữ lại vì các dòng trình bày đều khớp, chỉ nhóm/Child bên dưới có ngoại lệ. Thiếu PDF/OCR một phần/lỗi scope/native/lifecycle không được mở.

Metadata riêng `DGC_CAPTURED_INVOICE_ROUNDING_V2`, `headerArithmetic=OFFSETTING_CHARACTERIZED_LINE_DELTAS`. Reader kiểm source/provenance/target hashes, header/detail/AR/payment evidence, Total/Child, hai dấu và tổng delta 0. V1 vẫn đòi header delta khác 0; không thể hạ V2 xuống V1, bỏ discriminator hoặc hash lại dữ liệu sửa để vượt kiểm tra. Original strict/V1 plans/gates giữ nguyên.

Runner `rehearseInvoiceOffsetting` chỉ nhận whole candidates trên localhost DB `dgc_migration_staging_*`; dùng transaction/replay/byte custody/rollback hiện có. Cache chỉ phép biến đổi thuần dữ liệu trong lượt validation, không cache PDF/DB. Target Invoice/AR CANCELLED/non-current, scopes/revenue BLOCKED/non-current, evidence document DRAFT. Không có HTTP/UI, payment/cash, local approval hoặc real-user provisioning.

## Kiểm chứng

- API TypeScript build và **30 migration suites đạt**, gồm 23 planner assertions mới.
- **104 PostgreSQL assertions mới đạt**: synthetic header 67/7/60 USD, hai Total scopes/bốn revenue, deltas +0,01/−0,01; source Paid giữ AR 60/60/0 cùng receipt evidence, không tạo payment/cash.
- Kiểm sửa components/AR/metadata/source payment/detail/staged payload, Invoice/recon PDF tamper, lỗi giữa transaction, AR drift, replay và outer rollback sạch.
- Hồi quy đạt: source reader 94, revenue-rounding reader 30, recon PDF custody 60, Invoice V1 PostgreSQL 96, reference-rounding PostgreSQL 107, reference strict PostgreSQL 76, Invoice strict PostgreSQL 56.
- Nguồn thật: **ba Invoice–AR, 17 nhóm/26 revenue** ghi thử; reader kiểm đủ 3/3 Invoice, 26/26 revenue và 17 Total roots qua Invoice. Components/paid/outstanding khớp nguồn; replay tạo 0 Invoice/0 revenue trùng; **23 model counts rollback khớp**.
- Private verification: staging nguồn vẫn 3.154 raw/37 master links/19 migrations; actual copy mới cùng raw/master counts/23 migrations; synthetic copy mới 24 migrations trở về trống. **0 financial records committed**, không thêm schema migration.
- CLI `verify-invoice-offsetting` nguồn thật đạt, đúng plan pin bên dưới và `commitAllowed=false`; syntax check đạt.

Private outputs: `artifacts/dgc-migration/20261023/invoice-offsetting/` gồm plan/rehearsal/runtime-proof/verification. DB mới `dgc_migration_staging_invoice_offsetting_20261023` và suffix `_synthetic`, clone từ các DB trial DGC trước. Chỉ container DGC `dgc-erp-acceptance-postgres`, loopback 55433; không tác động GST.

Plan pin: `3fd92cfcbd503ee871c3ce21579f680c0cf349f22538355b6393d72676568f09`.

Rehearsal digest: `1bd9aadf7ea95c6903d404eeb63365f642098de6eb59c8fcc01361b432ece6fe`. Runtime-proof toàn file body digest: `0318c56c4ad6f35afc10a2569c5e4307127fedb1df57afdf76261dba6599bd3e`; khác digest chỉ mảng Invoice do helper in ra.

## Lệnh và tiếp tục

`migration:prepare-invoice-offsetting`, `migration:verify-invoice-offsetting`, `migration:rehearse-invoice-offsetting` nhận `--snapshot --snapshot-hash --plan --review --review-hash --manifest --manifest-hash --restore-plan --rounding-review --rounding-review-hash --exception-plan [--decisions]`. Verify/rehearse thêm `--offsetting-plan`; prepare/rehearse có `--out` private. Rehearse thêm `--source-rows all-candidates` hoặc danh sách hàng, `--root` Invoice PDFs, `--recon-manifest --recon-manifest-hash --recon-root` và DATABASE_URL staging riêng. Không có commit path.

Tiếp theo ghép profile mới với strict/V1 trong **toàn bộ tập Invoice của từng SOA/package**, kiểm registry/dependency guard/runtime reader/replay/rollback. Worklist đã chốt trước đợt này vẫn **39 Invoice dependencies/39 documents có refs, 31 package no-ref riêng**; chưa giảm khi chưa thử toàn tập. Bảy package V1 trước giữ nguyên plan pin và kết quả.

Sau đó tiếp tục historical actor/date/current/revision/receipt adapter, đối chiếu tổng và staging UAT. SOA cutoff, timezone, ba financial links và môi trường DGC riêng vẫn pending. Chưa financial import, activation, push hoặc deploy.
