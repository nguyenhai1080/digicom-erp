# Thu lịch sử: giữ nguyên precision, actor và chính sách không cash

Ngày 23/10/2026. Đây là adapter lưu source receipts và rehearsal local; chưa có operational financial import hoặc cutover.

## Nguồn và thay đổi

Đã đọc donor v61 `51_Payment_Transaction.js` từ kho reference read-only: `recordInvoicePayment` round USD hai số, VND nguyên và gọi sync tạo transaction/cash. Không chạy donor. Snapshot thật có 51 receipts/45 Invoice nguồn, trong đó bốn raw Paid_Amount_VND có phần lẻ tới 8 số và 17 Payment_FX_Rate có hơn 4 số (tối đa 12). Không áp writer hiện tại để sửa lại số lịch sử hoặc suy tiền từ USD×FX.

Migration `20261023001000_dgc_source_receipts` mở rộng riêng paidVnd/cashAmount/fxRate của InvoicePayment thành Decimal(30,12). Manual/live receipts tiếp tục giữ quy tắc VND nguyên, local approver và các kiểm tiền/quy đổi cũ. Không backfill, đổi tiền hoặc thêm operational MZN. Các khoản nhập nguồn có tag `DGC_SOURCE_RECEIPT_V1`, approvedById=null, cashAccountId=null; actor/serial ngày nguồn nằm trong canonical source JSON, không ánh xạ thành local approval hoặc tài khoản tiền giả.

DB trigger chỉ nhận source receipt thuộc DGC khi khớp staged full snapshot, physical receipt/header row/row hash, canonical payload, đúng Invoice/partner/number/currency, ba khoản độc lập USD/VND/FX, ngày serial và Swift/method/bank/note. Receipt nhập nguồn không được sửa/xóa hoặc đổi sang local approval/cash account; chỉ documentId có thể bổ sung sau bằng workflow chứng từ riêng. CashEntry INVOICE_RECEIPT gắn source receipt bị từ chối, kể cả khi code khác vô tình đi qua. Rollback không bị cản vì không phải lệnh DELETE.

API post-cash chặn source tag trước lock/write tiền; GET giữ quyền INVOICE_PAYMENT_VIEW và không cấp cash catalog cho reader. Response source receipt chỉ chứa reference/tag/date/rate policy, bỏ raw row và raw actor JSON. Giao diện giữ 10 dòng/trang, hiển thị source VND/FX chính xác tới 12 chữ số và không có nút bổ sung tài khoản cho source receipts. Manual history hiện có giữ hành vi cũ.

## Rehearsal trên clone host

`receiptTargetPlan` kiểm và ghim đủ 51 nguồn: 51 EXACT_SOURCE_RECEIPT_SHAPE, 45 parent bindings, 51 khớp tổng receipts/paid/outstanding nguồn. Mọi operationalAcceptance/financialPosting vẫn false. Không dùng kết quả này để bỏ source/scope/PDF/lifecycle holds của Invoice.

`rehearseSourceReceipts` chỉ chấp nhận localhost dgc_migration_staging_* và full staged rows đúng hash. DB `dgc_migration_staging_receipt_source_v2_synthetic` clone nền host/master/full raw, áp đủ 25 migrations. Bản `...receipt_source_synthetic` đầu tiên là DB thử cũ trước khi bổ sung DELETE guard, không dùng làm proof cuối.

Trong transaction, tạo 45 parent shells CANCELLED/noncurrent và metadata original Invoice PDFs đã kiểm bytes/hash; technical creator INACTIVE, không role/session, không giả source approver. Các shells có số header gốc nhưng không AR/scopes hoặc lifecycle vận hành. Chúng chỉ phục vụ receipt storage shape, không phải full Invoice restoration. 51 receipt rows giữ nguyên USD/VND/FX, original actor/date/canonical row; replay 0 created/51 unchanged, toàn bộ receipt/parent/provenance/creator đều rollback. 37 master links và raw staging không đổi; không update Invoice/revenue/AR runtime hoặc cash.

Proof private: `artifacts/dgc-migration/20261023/source-receipts/target-plan.json`, `proof-*.json`. Logs lỗi thử ban đầu giữ private; không publish hoặc coi log cũ là kết quả kiểm cuối. Không lấy số tiền source sang fixtures public.

## Kiểm tra và trạng thái triển khai

- 28 assertions planner: precision/date/context/tamper/no source mutation; 73 PostgreSQL assertions nguồn thật: 51 exact receipts, four fractional VND, 17 high-precision FX, 45 parent paid sums, replay/rollback, sai Invoice/tenant/amount/date/FX/snapshot, fake approver, update/delete và cash posting đều bị chặn.
- 19 HTTP assertions: đúng quyền, CSRF, no cash catalog/raw actor/row disclosure và cash denial; 7 display assertions cho số lớn/phần lẻ và nút cash bị ẩn.
- 191 hồi quy issue/payment/history/currency/tenant/CSRF/race/rollback và pagination đạt trên DB acceptance mới 25 migrations; 33 migration suites, 24 owner-link assertions và API/UI build đạt.
- Hiện website vẫn v11/24 migrations trong lúc chuẩn bị release. Đã yêu cầu backup DB trước migration 25 qua browser đúng tài khoản DGC. Cần chốt kết quả backup, gói release/Linux build và kiểm host sau deploy trước khi xác nhận triển khai. Bootstrap/seed/master transfer không được bật lại.

Tiếp theo vẫn là importer tài chính vận hành/full Invoice-revenue-AR lifecycle/registry/file promotion, bốn Issued Invoice còn held, đối chiếu và UAT. Các receipts đã lưu/đọc thử không thay nghiệm thu SOA, receipts trạng thái vận hành hoặc go-live; không mở công cụ master để chuyển tài chính.
