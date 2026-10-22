# Ngoại lệ làm tròn: lưu/đọc và diễn tập PostgreSQL

Ngày 22/10/2026. Tiếp sau [characterization donor](DGC_DONOR_ROUNDING_20261022.md). Đã kiểm thêm khả năng bảo toàn số liệu nguồn trong target shape, không thay financial acceptance hoặc mở importer commit.

## Kết quả snapshot thật

Đã tạo DB copy riêng **`dgc_migration_staging_rounding_20261022`** từ DB Invoice restore snapshot-copy không có financial records, container DGC loopback 55433. Không đổi schema: DB copy giữ 23 migrations. Không sử dụng DB/container GST.

| Kết quả mới | Số lượng |
| --- | ---: |
| Nhóm đủ điều kiện riêng cho exception shape trial | **66** |
| Revenue/ReconciliationItem ghi thử | **105** |
| Metadata ngoại lệ trên cả Revenue và item | **73** |
| Delta Payable − (Revenue − WHT) | 39 dòng −0,01 USD; 34 dòng +0,01 USD |
| Runtime source reader đọc đúng từ DB trong transaction | **105/105** |
| Replay | 0 groups/rows mới; 105 unchanged |
| Footprint trước/sau rollback | **23 nhóm bảng khớp** |

66 Reconciliation headers/105 items/105 revenue cùng provenance/audit đã rollback toàn bộ. Revenue/Reconciliation vẫn BLOCKED, không current, không local approver/timestamp. Không tạo Invoice/AR/payment, InputRecon/AP, document/attachment, cash/account/transfer, user/role/session hoặc approval request. PDF originals chỉ đọc/hash lại trước và sau trial; không copy sang storage vận hành hoặc tái sinh PDF.

SQL sau thử trên DB copy: **3.154 raw/37 provenance/0 revenue/0 reconciliation/0 Invoice/0 AR/0 cash**. Staging gốc cũng giữ 3.154 raw/37 links/0 revenue/0 Invoice/0 cash. DB thử synthetic riêng **`dgc_migration_staging_rounding_20261022_synthetic`**, clone từ reference synthetic trống (24 migrations), fixtures và setup rollback về trống. Không áp thêm migration lên DB nào trong đợt này.

## Điều kiện shape profile, không gỡ gate cũ

`rounding-exception.mjs` rederive target plan, lifecycle binding và donor characterization từ snapshot/owner decisions, kiểm pins và exact physical coverage. Chỉ chọn **toàn bộ nhóm** thỏa đồng thời:

1. Original business group vẫn HELD và có đúng một lý do `REVENUE_REQUIRES_REVIEW`.
2. Combined evidence còn HELD nhưng có đúng `BUSINESS_HELD`: không có missing PDF, printed USD/child mismatch, inactive source hoặc lifecycle hold khác.
3. Mọi row có exact captured identity hoặc là independent rounding đã characterize; không có source issue/check khác, native identity difference hoặc Number/Decimal disagreement.
4. Có ít nhất một characterized exception trong nhóm; manifest đúng pin và bytes nguồn được kiểm lại khi chạy trial.

Profile có 66 candidates; **199 nhóm ngoài profile** gồm cả nhóm bình thường đã từng REHEARSABLE, không phải thêm 199 financial blockers. Nhóm không đủ không được chọn từng dòng con để vượt gate.

Strict `rehearseRevenue` vẫn từ chối nhóm HELD như trước. `rehearseRoundingExceptions` là lối thử shape riêng, chỉ localhost `dgc_migration_staging_*`, không commit flag. Cả hai dùng cùng private materializer và transaction rollback; các target fields, management basis và TOTAL/CHILD aggregation không bị định nghĩa lại.

Các plan cũ giữ nguyên: revenue **169 REHEARSABLE/96 HELD**, Invoice **4 candidates/49 held/33 archive/5 drafts**, registry **77 held**. Không coi 66 shape candidates là financial acceptance hoặc là được phép lập Invoice.

## Metadata và runtime reader

`calculationJson.roundingException` format `DGC_CAPTURED_ROUNDING_EXCEPTION_V1` lưu snapshot/hash, physical revenue/header/detail, characterization hash, ba USD components độc lập, exact delta và các cờ no approval/no correction/no FX. Metadata giống nhau ở Revenue và ReconciliationItem, nằm trong target provenance hash. Raw source actor/date/float/cells tiếp tục giữ canonical JSON; không tạo user giả để gán vai trò source approver.

`readHistoricalRevenueSource` kiểm thêm staged detail row/hash/ID/doc binding; native amounts/rate chỉ dùng replay evidence, ba USD phải khớp detail và raw revenue, native identity và Number/Decimal phải nhất quán. Chỉ nhận delta tuyệt đối đúng 0,01 trong format này, không dùng tolerance để sửa số tiền. Response `historicalArithmetic` chỉ trả USD/source addresses và cờ technical review; không trả native amounts/rate thành tỷ giá vận hành.

- Xóa metadata trên row có captured identity delta vẫn bị từ chối, kể cả xóa cả marker ở reconciliation rồi băm lại target.
- Sửa delta/components/mode/acceptance/FX flag/source pointers hoặc thêm field lạ rồi rehash target vẫn bị từ chối.
- `historicalArithmetic=null` trên các row không có ngoại lệ; ba captured amounts cũ không đổi.
- Endpoint technical hiện có vẫn SYSTEM_CONFIG_EDIT/DGC, cùng company/snapshot pin và mặc định chưa cấu hình thật. Không có route duyệt, writer hay role mới; Staff không được mở evidence để đổi gate.
- Reader chỉ kiểm source/target thuộc định dạng rehearsal và replay riêng của row; không xác minh toàn snapshot/masters, original PDF semantics/signature hoặc final financial acceptance. `originalPdfVerified=false` của reader không bị byte verification của batch biến thành true.

## Verification

- API TypeScript build đạt.
- **26 suite migration đạt**, suite shape profile mới **21 assertions**; strict HELD gate, whole group selection, native/source/PDF/lifecycle holds và rehashed plan tamper được giữ.
- **30 reader assertions mới** với controlled DB doubles: cả ±0,01, no correction/no FX/no approval, source pin/detail binding và stripped/forged metadata.
- **83 PostgreSQL/runtime assertions mới**: actual materializer/reader, exact independent amounts, canonical source actor/date, replay, injected write failure/target drift/PDF tamper, forged metadata sau rehash target, outer rollback sạch.
- Hồi quy source API/HTTP **94**, PDF custody/HTTP **60**, source PostgreSQL **59**, Invoice/AR PostgreSQL **56**, revenue PostgreSQL **217** đều đạt sau refactor dùng chung materializer. Không đổi UI nên không chạy browser.
- Trial snapshot thật và 105 runtime reads đã chạy lại với build reader cuối cùng, không chỉ với fixtures. Giữ cả report rollback và proof đối chiếu từng row/amount/lifecycle trong private artifacts.

## Artifacts và lệnh

Private folder `artifacts/dgc-migration/20261022/rounding-exceptions/`:

- `plan.json`, pin **`5829891b8bb3a960c29387c2bcb55c0b19596b19808d2ce0b649332f17607473`**.
- `rehearsal.json`, digest **`1f729da69bab3fcc3a52a8b926b99db5a3b28a2e93fe4773722f4337539fcbba`**.
- `runtime-proof.json`, digest **`fadb744d23f94e128461f7bc5a7d3bb6a7a2ab885f8d1419cfbe2e1578b18ad4`**.
- `verification.json`: direct source-value comparison, ± delta counts và original gate counts chưa đổi.

```text
pnpm migration:prepare-rounding-exceptions ... --out <private-plan.json>
pnpm migration:verify-rounding-exceptions ... --exception-plan <private-plan.json>
pnpm migration:rehearse-rounding-exceptions ... --exception-plan <private-plan.json> --group-keys all-candidates --manifest <recon-files-manifest.json> --manifest-hash <pin> --root <original-recon-root> --out <private-trial.json>
pnpm test:migration:rounding-staging
pnpm --filter @erp/api test:historical-rounding
```

Input chung: `--snapshot/--snapshot-hash`, `--plan` revenue target, `--review/--review-hash` combined recon evidence, `--rounding-review/--rounding-review-hash`, `--decisions` khi có. `--group-keys` cũng nhận danh sách group keys riêng; không nhận danh sách partial rows. Test DB yêu cầu tên `dgc_migration_staging_rounding_*_synthetic`, trống, API build đã có. CLI verify plan thật đạt; configs thật và current operational ledgers không được thay.

## Tiếp theo

Ánh xạ tương ứng ngoại lệ trên Invoice header/detail và AR, giữ cả captured amounts lẫn exact deltas; không gọi generator hiện tại để sửa lịch sử. Giữ gate source PDF/lifecycle/scope và whole-document dependencies độc lập với shape profile. Sau rehearsal toàn chuỗi mới xem xét acceptance/import commit. 17 native identity differences, hai source-check exceptions, owner financial-link proposals, SOA cutoff/timezone và full real-user provisioning vẫn pending theo roadmap.
