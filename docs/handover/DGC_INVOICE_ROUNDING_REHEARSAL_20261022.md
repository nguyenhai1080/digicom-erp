# Invoice/AR giữ components lịch sử — diễn tập 22/10/2026

**Cập nhật sang 23/10: bản sửa cuối build đạt, nhưng vòng kiểm PostgreSQL/hồi quy cuối chưa hoàn tất do mất kết nối rồi hết timeout transaction. Không coi lượt trial ban đầu là kiểm chứng toàn bộ các guard bổ sung cuối phiên. Ưu tiên chạy lại kiểm tra trước khi mở rộng profile.**

## Phạm vi và kết quả

Tiếp sau `DGC_ROUNDING_EXCEPTION_REHEARSAL_20261022.md`, bổ sung profile riêng để ghi/đọc thử Invoice header/detail và AR có chênh lệch do donor làm tròn ba components độc lập. Donor `40_Invoice_Core.js` cộng Revenue/WHT/Payable từ lines riêng, round từng tổng; AR lấy TotalPayable đã capture. Không ép `payable = revenue - wht`, không tính lại số đã thu hoặc PDF.

Snapshot thật có **tám Invoice** đáp ứng profile (physical header rows 3, 9, 20, 28, 29, 31, 34, 35), phụ thuộc **46 nhóm/70 revenue**. Đã ghi thử đủ tám Invoice/AR, scopes chỉ dùng TOTAL, giữ CHILD làm presentation/evidence; chạy lại không tạo trùng và rollback toàn bộ. Invoice `CANCELLED/non-current`, scopes `BLOCKED/non-current`, AR `CANCELLED`; source status và captured amounts giữ riêng. Receipt chỉ canonical evidence, không tạo InvoicePayment/cash/approval.

Lượt đầu reader đọc tám Invoice và 46 source revenue được tham chiếu khi kiểm Invoice; 70 là số revenue materialize, chưa phải 70 runtime-reader proofs trong lượt này. Footprint lượt đầu 22 models rollback khớp. Bản cuối thêm approvalRequest thành model thứ 23 và kiểm full captured detail/AR/payment set, nhưng lượt xác minh cuối bị gián đoạn; chưa có `verification.json` hoàn tất cho bản cuối.

Profile 91 entries có tám candidate, 83 ngoài profile. **83 không phải 83 current Invoice blockers**: chứa bốn strict candidates cũ, 33 archive, năm draft và 41 held còn lại. Original restore vẫn bốn candidate/49 held/33 archive/năm draft; original revenue target vẫn 169 REHEARSABLE/96 HELD; reference registry vẫn 77 held. Đây là shape trial, không đổi readiness/acceptance và không có commit path.

## Kiểm tra và cấu trúc

- `scripts/dgc-migration/invoice-rounding.mjs` kiểm lại original restore, characterization, exception revenue, scope và billing plans theo source pins. Chỉ nhận header propagation được characterize, whole revenue groups đạt strict evidence hoặc exception profile. Các chênh lệch khác về AR/payment/amount, lỗi nguồn, PDF, scope, reservation hoặc lifecycle tiếp tục giữ lại.
- Metadata `DGC_CAPTURED_INVOICE_ROUNDING_V1` trong Invoice snapshot giữ snapshot/source/physical line/Total/AR addresses, ba USD, delta, original plan/review pins và các cờ không posting/approval/acceptance. Raw canonical snapshots, source values/cells và PDF không đổi.
- `invoice-rehearsal.mjs` dùng chung materializer, transaction, replay và rollback cũ. Runner nguồn mới cho phép kết hợp whole strict groups với exception groups; runner strict và exception-only cũ giữ selection guards. Kiểm bytes Invoice và Recon trước/sau ghi; không thêm hoặc nới schema constraint.
- `apps/api/src/modules/projects/historical-invoice-amounts.ts` là **reader nội bộ kỹ thuật, chưa có HTTP route/UI hoặc quyền mới**. Kiểm staged rows/provenance/target hashes, amounts độc lập, source AR/payment evidence, full line set, TOTAL/CHILD lineage và gọi reader revenue thật. Thiếu/sửa metadata, sửa amounts hoặc bỏ dòng evidence không được hợp thức hóa bằng rehash target. Reader trả operational/posting/acceptance false; originalPdfVerified false vì byte custody do runner riêng kiểm. Actor/date mapping và PDF semantic acceptance chưa hoàn tất.
- Technical creator chỉ tồn tại trong transaction, INACTIVE, không roles/session; không giả người duyệt nguồn. Không gán quyền người dùng thật, không cash account hoặc operational MZN.

## Private evidence và DB

`artifacts/dgc-migration/20261022/invoice-rounding/` chứa plan, rehearsal và runtime-proof private. Không đưa raw records/PDF vào Git.

- Snapshot: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.
- Original restore plan: `7ee9be18858a3f89d5f402ff45ebb1086f03bb0c944f448eca6787dc90534904`.
- Invoice rounding profile **lượt đầu**: `14c4146cd4d02e6dcb123d6e139015c2f4098714a273de85f7464d8aae4519ec`. Bản cuối bổ sung kiểm history issues; phải rederive và ghi pin mới khi chạy lại, không đổi pin trong proof cũ.
- Revenue exception plan: `5829891b8bb3a960c29387c2bcb55c0b19596b19808d2ce0b649332f17607473`.
- Characterization review: `2c299435c89fd73f256a15eb7ac6144b980e8469abae51315d9fe6bdc8c069fa`.
- Invoice manifest: `dc7739817c07f064d2a5bc00d48a36e80eb94f3b18cdc02912bac796a1ab3f68`.
- Recon manifest: `110fc2d6021f9faae7d5ea430133ef74013ec97794faeefef0548636ed9ab48f`.

DB `dgc_migration_staging_invoice_rounding_20261022` được clone từ rounding trial copy; DB synthetic riêng `dgc_migration_staging_invoice_rounding_20261022_synthetic` clone từ empty rounding synthetic. Chỉ container DGC `dgc-erp-acceptance-postgres`, loopback 55433. Không thêm migration. DB nguồn giữ 3.154 staged rows/37 master provenance/0 financial committed.

Kiểm SQL trực tiếp sau khởi động lại container: DB invoice rounding copy có 3.154 raw/37 links/0 Invoice/0 revenue/0 AR. Không restart Docker engine hoặc dịch vụ GST. Chỉ container DGC được restart sau lỗi kết nối.

## Kiểm thử và phần còn lại

- Đã đạt: API TypeScript build bản cuối; 94 source-reader, 30 revenue-rounding-reader và 60 PDF custody assertions.
- Lượt triển khai ban đầu đạt 25 planner assertions và 88 PostgreSQL/runtime assertions (paid evidence, replay, failure/drift, metadata rehash, PDF tamper và outer rollback).
- Sau đó thêm guard full captured detail/AR/payment sets, amount tamper và approval footprint. PostgreSQL rerun đầu mất kết nối loopback; sau restart tiếp tục timeout outer transaction 120 giây. Chưa có kết quả đạt cho các guard mới, không tăng timeout runtime để che lỗi môi trường.
- Bộ 27 migration suites đã khởi chạy nhưng chưa hoàn tất; 56 strict Invoice/83 revenue exception/217 revenue PostgreSQL regression chưa chạy xong trong đợt này. Không dùng kết quả phiên trước làm kết quả phiên này.
- Cần chạy lại trên DB fixture trống khi môi trường ổn định: API build đã đạt; `test:migration`, `test:migration:invoice-rounding-staging`, rồi strict Invoice, rounding và revenue staging regressions. Sau đó chạy snapshot thật với reader đủ 8 Invoice/70 revenue và private verification; cập nhật pins/proofs, không ghi đè proof ban đầu bằng report dở dang.

## Lệnh sử dụng và tiếp tục

`migration:prepare-invoice-rounding` và `migration:verify-invoice-rounding` dùng `--snapshot --snapshot-hash --plan --review --review-hash --manifest --manifest-hash --restore-plan --rounding-review --rounding-review-hash --exception-plan [--decisions]`, thêm `--out` khi prepare hoặc `--invoice-rounding-plan` khi verify.

`migration:rehearse-invoice-rounding` dùng các input/pins trên, thêm `--invoice-rounding-plan --source-rows all-candidates --root --recon-manifest --recon-manifest-hash --recon-root --out` và DATABASE_URL riêng được staging guard chấp nhận. Chỉ rollback; CLI report không tự khẳng định runtime-reader đã kiểm. Private runtime trial gọi reader trong transaction trước deliberate rollback để có evidence riêng.

Tiếp theo: hoàn tất lượt kiểm cuối trên, rồi whole-document exception dependency profile cho SOA/package, không mở strict registry bằng cách đổi gate cũ; sau đó actor/date/current revision và receipt lifecycle. Chưa nhập tài chính chính thức, promotion file hoặc activation, chưa push/deploy. Ba financial links, cutoff SOA, reporting timezone và môi trường DGC đúng tài khoản vẫn pending.
