# Diễn tập liên kết tài liệu với Invoice có ngoại lệ làm tròn

Ngày 23/10/2026. Tiếp sau [Invoice/AR rounding trial](DGC_INVOICE_ROUNDING_REHEARSAL_20261022.md). Đây là profile diễn tập rollback riêng, không mở import/approval hoặc thay gate strict cũ.

## Phạm vi

Planner kiểm lại original reference registration plan và Invoice rounding plan, rồi xét **toàn bộ tập Invoice của mỗi tài liệu**. Mỗi dependency phải là strict Invoice candidate đã kiểm hoặc Invoice rounding candidate đã characterize; phải có ít nhất một rounding dependency. Mọi lý do giữ lại khác, gồm thiếu source refs/PDF/lifecycle/binding, tiếp tục giữ nguyên.

Snapshot thật có **bảy package candidates**, mỗi gói tham chiếu một Invoice: physical package rows 3, 9, 20, 29, 31, 34, 35. Binding dùng sheet/row/legacy ID/hash từ nguồn, không ghép theo sự trùng nhau của số hàng. **70 tài liệu ngoài profile** gồm ba SOA, 31 package không có Invoice refs và 36 package khác chưa đủ dependencies. Original strict registry vẫn 77 HELD/0 whole-document candidate; không sửa report/gate cũ để mở nhập.

## Triển khai và giới hạn

- `reference-rounding.mjs` lập/verify profile `dgc-reference-rounding-shape-plan-v1` từ snapshot và các plans ghim hash; tự hash lại một plan đã sửa không vượt được verify.
- `rehearseInvoiceEvidenceSet` kết hợp strict/rounding Invoice trong cùng transaction, với whole revenue groups. Các runner strict và rounding-only vẫn giữ selection guards riêng.
- Dùng lại reference materializer/replay/rollback hiện có; luôn tạo Document DRAFT và Attachment metadata `DGC_REHEARSAL_EVIDENCE`. Invoice/AR vẫn CANCELLED/non-current, scopes/revenue BLOCKED/non-current. Không tạo payment, cash, AP, approval request, roles/session hoặc file vận hành.
- Source Approved chỉ là trạng thái evidence. Đã đọc donor v61 `92_Legacy_ApprovalPackage.js`: hàm approve tìm lại related records, duyệt revenue/recon, stamp actor/date và có thể issue Draft Invoice. Không chạy hàm này để phục hồi lịch sử; giữ captured header/related lists/status/actor/date trong canonical audit JSON, không tạo local approval.
- Guard runtime `assertInvoiceUnused` được gọi trong diễn tập; registry phải chặn hủy Invoice dù Document target chỉ DRAFT. Không thay `linkInvoiceDocuments`: importer vận hành tương lai vẫn phải có lifecycle/acceptance phù hợp và gọi helper cho toàn bộ tập Invoice trong transaction.
- Byte custody được kiểm trong các pha Invoice/recon/reference tương ứng, không phải nghiệm thu chữ ký, nội dung PDF hoặc promotion storage. Related recon/revenue lists của package giữ raw evidence; đây chưa phải runtime approval-package parity.

## Chi phí kiểm tra và tính toàn vẹn

Profile mới rederive đầy đủ các source plans trước khi vào transaction. `planning-context.mjs` dùng AsyncLocalStorage để dùng lại **các phép biến đổi thuần dữ liệu trong một lượt validation/trial**; mỗi lần dùng kiểm digest toàn bộ semantic inputs, không chỉ tin các hash được khai báo. Kết quả được clone để caller không sửa cache. Không có cache qua các lượt gọi độc lập; PDF và DB verifiers không được cache. Các runner cũ ngoài context giữ cách tính trước đó.

Trong transaction, kiểm lại bytes reference PDF và hash toàn bộ input đã validate, cùng staging/master/target checks của Invoice/revenue runner. Kiểm sửa input giữa chừng đã có fault injection riêng. Không tăng timeout runtime hoặc nới constraint để che thời gian tính lại source graph.

## Kiểm thử và evidence

- Planner mới: 18 assertions; scoped planning: 9 assertions về stale pins, mutation và bản sao kết quả.
- **29 migration suites đạt**; hồi quy PostgreSQL **76 reference/96 Invoice rounding/56 strict Invoice/83 revenue rounding/217 revenue** đạt trên bản cuối.
- CLI `verify-reference-rounding` đã kiểm plan nguồn thật, trả `verified=true`, đúng pin `e3886e...` và `registryCommitAllowed=false`; không cần kết nối DB cho lệnh verify.
- PostgreSQL synthetic: **107 assertions đạt**, gồm hai tài liệu (SOA nguồn Draft và package nguồn Approved), mỗi tài liệu đủ hai Invoice (một strict/một rounding), bốn links; reader thật, cancellation guard, replay, missing/kind/ACTIVE drift, lỗi giữa tập link, input drift, PDF tamper và outer rollback về 0.
- Snapshot thật đã ghi thử **bảy packages/bảy registry links/bảy Invoice–AR**, với **40 nhóm/61 revenue**. Reader thật đọc đủ bảy Invoice, 61 revenue và bảy documents; cancellation dependency guard chặn đúng 7/7 Invoice. Replay tạo 0 targets/links trùng, 23 model counts rollback khớp.
- Private verification kiểm đúng captured components/paid/AR/source headers, original gates không đổi; bốn DB nguồn/copy/synthetic không có financial records committed. Staging gốc vẫn 3.154 raw/37 master links và 19 migrations; Invoice copy 23 migrations; hai DB reference mới 24 migrations.
- `remaining-dependencies.json` giữ worklist ghim plan hash: **39 Invoice dependencies riêng biệt** chặn 39 tài liệu có refs, tối đa ba documents/Invoice; 31 package no-ref giữ riêng. Không coi 70 documents ngoài profile là 70 Invoice blockers.

Private outputs: `artifacts/dgc-migration/20261023/reference-rounding/`. Plan pin: `e3886e0d98e2aa2682a8c4fa077d26908c839954f8cf021c734f231eb2557cef`.

Rehearsal digest: `80d6bf86a5078a85f477d810d3da3bffd4a1f663a3686bf1cfe5a4bd35c158c8`. Runtime proof digest: `8784b147216cad804da9cc83e214ab661f0008795f91be22e0b175a2ecfea820`. Plan pins giữ nguyên sau tối ưu planning context; không thay money hoặc readiness để đạt rehearsal.

DB riêng mới: `dgc_migration_staging_reference_rounding_20261023`, clone từ Invoice rounding copy, áp đúng migration đã có `20261022002000_dgc_document_import_provenance` (24 migrations). DB synthetic mới cùng tiền tố/suffix `_synthetic`, clone từ reference synthetic trống (24 migrations). Chỉ dùng container DGC `dgc-erp-acceptance-postgres`, loopback 55433; không đổi staging gốc 19 migrations hoặc Invoice copy 23 migrations.

## Lệnh và tiếp tục

`migration:prepare-reference-rounding`, `migration:verify-reference-rounding`, `migration:rehearse-reference-rounding` dùng các input reference registration hiện có: `--snapshot --snapshot-hash --plan --review --review-hash --manifest --manifest-hash --restore-plan --reference-review --reference-review-hash --reference-manifest --reference-manifest-hash --reference-root [--decisions]`.

Thêm `--registration-plan` (original strict), `--invoice-rounding-plan`, `--rounding-review --rounding-review-hash --exception-plan`. Verify/rehearse thêm `--rounding-registration-plan`; prepare/rehearse có `--out`. Rehearse thêm `--root` original Invoice PDFs, `--documents <sheet:row,...>`, `--recon-manifest --recon-manifest-hash --recon-root` và DATABASE_URL staging riêng. Selection held/duplicate bị từ chối trước kết nối DB; không có commit flag/path.

Tiếp theo: các Invoice dependencies còn held và adapter lịch sử actor/date, current/revision, receipt lifecycle; rồi đối chiếu tổng và staging UAT toàn chuỗi. SOA cutoff, reporting timezone, ba financial links và môi trường DGC đúng tài khoản vẫn pending. Chưa financial import chính thức, activation, cash posting, push hoặc deploy.
