# Nối doanh thu lịch sử với Invoice, khoản thu và AR

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục sau [proposal lifecycle/revision](DGC_REVENUE_LIFECYCLE_20261022.md). Đã thêm bước chuẩn bị và xác minh chỉ đọc; **không có database writer, không mở financial import**.

## Kết quả trên snapshot

Rà đủ **409 physical revenue rows / 91 Invoice headers**, bao gồm 53 Invoice hiện hành, năm nháp và 33 bản lịch sử. Proposal theo từng revenue:

| Trạng thái đích đề xuất | Số hàng |
| --- | ---: |
| PAID | 34 |
| INVOICED | 8 |
| SUPERSEDED từ source audit đã bind | 5 |
| Chưa đề xuất trạng thái tài chính | 362 |

42 hàng có trạng thái theo đúng một dòng của một Invoice hiện hành, qua kiểm chuỗi nguồn, cấu trúc và số tiền chính xác. Đây **không phải 42 hàng được phép nhập**: business/evidence gates của từng nhóm vẫn giữ nguyên, target scope mapping chưa accepted, actor/date và adapter lịch sử chưa hoàn tất. Năm SUPERSEDED giữ nguyên Approved/N nguồn và quan hệ audit của bước trước.

362 hàng còn lại gồm 224 hàng có Invoice hiện hành nhưng cần review, 130 không có dòng Invoice hiện hành trực tiếp, ba hàng vướng reservation theo business scope, hai hàng chưa rõ source lifecycle và ba hàng trước duyệt. Các nhóm lý do có thể chồng lấn: 219 hàng vướng amount review, 21 structural review, 19 source lifecycle của toàn Invoice, ba liên kết Revenue chưa resolve và bảy draft reservations. Không dùng dung sai để tự xóa chênh lệch hoặc tự xác nhận ba financial-link proposals còn chờ owner.

## Căn cứ nghiệp vụ và guard

Đã đọc donor `40_Invoice_Core.js` (active Recon provenance, TOTAL→CHILD expansion, issue integrity, hai nhánh tính status) và `51_Payment_Transaction.js` (current/issued/regeneration/payment guards, Invoice/AR sync). Donor giữ revenue Approved sau lập Invoice/thu tiền; không có phép đổi tên Approved→Invoice Ready an toàn. Donor có hai ngưỡng Paid khác nhau: 0.005 ở Invoice Core và 0.01 ở payment flow. Chúng là sai khác được ghi nhận; bridge không chạy lại các hàm này, không đổi stored status/số tiền hoặc tính Overdue theo ngày hiện tại.

Target `finance-ledger.ts` đổi revenue sang INVOICED khi issue; `invoice-payments.ts` đổi sang PARTIALLY_PAID/PAID và kiểm source scope/current Recon. `historical-payment.ts` dùng kiểm số dư chính xác. Bridge chỉ đề xuất trạng thái dựa trên nguồn đã capture và kiểm số tiền chính xác; Paid còn một cent vẫn phải review, không tự write-off.

`revenue-billing.mjs` dựng lại lifecycle từ combined review đã ghim, graph và Invoice history plan từ snapshot/owner master decisions. Không nhận financial link decisions chưa được duyệt. Các guard:

- Exact physical row/hash cho Revenue_ID và Invoice_ID; mọi candidate ambiguous/context-conflicting vẫn hiện trong review. Không chọn hàng đầu hoặc ghép theo số tiền.
- Cùng partner/service/kỳ nhưng Revenue_ID thiếu/khác vẫn giữ reservation; dòng không xác định được Invoice parent cũng giữ service scope khi chưa có bằng chứng scope. Thiếu direct line không có nghĩa là chưa lập Invoice.
- Nhiều Invoice hiện hành, lặp revenue line, draft, regeneration, cờ current không explicit, currency khác, source chain không active/Approved, AR status/current hoặc amount khác đều giữ review. Kiểm source lifecycle của **toàn Invoice**, tránh khôi phục một phần consolidated Invoice có nguồn chưa hợp lệ.
- Header/detail/source USD, payment sum, outstanding identity, AR cardinality và original/paid/outstanding kế thừa exact Decimal finance review. Không tính lại tiền theo tax/share/FX hiện tại. Tất cả khoản thu capture được kiểm cùng nhau, **không chọn SOA cutoff**.
- Dòng Invoice Superseded/Cancelled giữ ở archive riêng; không làm current AR, không trở thành nguồn được lập lại chỉ vì bản cũ đã hủy. Archive không tự quyết trạng thái tài chính của revenue hiện hành.
- Donor có thể xuất TOTAL thành các CHILD lines. Bridge ghi `childCoverage` để thấy các dòng liên quan, chưa suy status TOTAL từ một CHILD hoặc phân bổ payment cấp Invoice cho từng CHILD. Không cộng TOTAL và CHILD thành tổng billed.

Source header/details/payments/AR và revenue giữ canonical JSON strings với raw cells, actor và ngày/serial nguồn. Không map email sang local approver, không tạo issued/approved timestamps mới, không chọn reporting timezone. Số USD/VND nguồn giữ nguyên; không suy tiền thực nhận VND, không tạo tài khoản hoặc cash movement. `invoiceReceiptAllocation=null`, mọi `readyToImport=false`, `rebillingAllowed=false`, rehearsal BLOCKED/isCurrent=false.

## Chạy lại và kiểm tra

```powershell
node scripts/dgc-migration.mjs prepare-revenue-billing --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --out artifacts/<billing-proposal.json>
node scripts/dgc-migration.mjs verify-revenue-billing --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --proposal artifacts/<billing-proposal.json>
pnpm test:migration
```

Private report: `artifacts/dgc-migration/20261022/revenue-billing/proposal.json`, hash `1a05546085882856ad45ac6055827efc4b92e6caa6e498062e4c4e373d36d6c0`. Combined pin vẫn `e74526ef5a7baf1b6ffc8bc22029603f7c2f5d1d2b8b12a986eb88702ca4cf52`. `verification.json` kiểm đủ 409 source row hashes, raw financial payload hashes, các activation flags và không có receipt allocation. CLI verify dựng lại toàn proposal, chống chỉnh trạng thái/số tiền rồi tự rehash.

**19 suite migration đạt; suite mới có 115 assertions.** Bao gồm Paid/partial/issued/overdue/draft, source preapproval/inactive, duplicate/context-conflicting/missing links, repeated/two-invoice coverage, AR/currency/amount/regeneration, one-cent tolerance, TOTAL/CHILD, archive separation, raw date precision, immutable inputs và rehashed tamper guards. Không thay runtime/schema/DB, không push/deploy.

Tiếp tục: đối chiếu target InvoiceScope cho TOTAL/CHILD và các dòng chưa có direct current Invoice; giữ reservation để không rebill. Sau đó hoàn thiện adapter historical source/actor/date cùng restore Invoice/payment/AR có replay/rollback. Financial link proposals, SOA cutoff/timezone, PDF thiếu và role provisioning vẫn theo bàn giao; “làm tiếp” không tự xác nhận các quyết định này.
