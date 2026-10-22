# Ánh xạ InvoiceScope lịch sử theo Total/Child

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục [billing bridge](DGC_REVENUE_BILLING_20261022.md). Đã thêm planner/verify chỉ đọc, chưa có writer hoặc kích hoạt financial records.

## Kết quả nguồn thật

Giữ đủ **91 Invoice / 343 detail rows** trong snapshot gốc. Trong 58 Invoice hiện hành hoặc nháp, **51 nối được cấu trúc scope**, bảy tiếp tục review. 33 bản Superseded/Cancelled đi nhánh archive, không tạo current scope.

Proposal có **261 contract scopes / 261 authoritative Total items**. 257 Total được trình bày bằng dòng Total thực có trong Invoice; bốn Total được trình bày bằng các Child lines. Có 46 Invoice gồm nhiều contract scopes. Mỗi Total chỉ xuất hiện một lần trong mỗi Invoice; Child không thành scope item và không cộng thêm tiền vào AR.

**STRUCTURAL_SCOPE_BOUND không phải được phép nhập.** 41 Invoice còn finance review và ba Invoice lệch tổng các authoritative Total so với header (có thể chồng lấn). Giữ exact differences, không dùng dung sai để nâng trạng thái. Sau guard toàn Invoice, proposal có 28 Total PAID, sáu INVOICED; 227 Total chưa đề xuất financial status. Các con số này xét **authoritative scope items**, khác 409 physical revenue rows của billing bridge. Không ghi ngược hay thay thế báo cáo trước.

Tất cả `readyToImport=false`, `createCurrentScope=false`, scope `isCurrent=false`, `targetScopeMappingAccepted=false`. Business/evidence HELD giữ nguyên trong từng item; không tạo approval, phân bổ receipt hoặc cash/bank movement.

## Căn cứ donor và target

Đã đọc lại donor `40_Invoice_Core.js`: filter Approved/USD/positive/active Recon; chỉ Total/Y đóng góp tổng, Child dùng trình bày; expand theo parent service; điều chỉnh chi tiết về authoritative total; lưu Invoice details **không lưu Invoice_Group_Service_ID**. Không thể lấy lại group ID bằng cách gọi generator hoặc đoán theo cùng số tiền.

Đọc target `invoices.ts`, `dgc-invoice-lines.ts`, `finance-ledger.ts`, `invoice-payments.ts`, `invoice-cancel.ts` và schema InvoiceScope/InvoiceScopeItem:

- Target chia scope theo contract, item trỏ authoritative Total; immutable Invoice snapshot giữ actual detail lines, kể cả Child.
- Issue/payment đổi trạng thái các scope-item revenues. Vì vậy planner đề xuất status cho Total; chưa áp một trạng thái tài chính chung cho các Child không phải scope item.
- Target overlap guard dựa vào Total item IDs; nhập Child thành item sẽ bỏ sót duplicate billing ở chế độ khác và có thể đếm hai lần. Cancel/issue cũng cần đúng source Revenue IDs từ Total.
- Generator DGC mới có thể mở rộng Child và điều chỉnh dòng cuối. **Không chạy generator khi khôi phục Invoice cũ**: nhiều Invoice nguồn thực sự chỉ có Total, dù đối soát có Child. Phải giữ snapshot/PDF/amounts đã capture.
- Runtime hiện yêu cầu approved upload/signed document và local actor. Planner không dựng upload/approval giả để mở guard; historical source adapter vẫn cần triển khai riêng.

## Quy tắc ánh xạ và bảo toàn

`revenue-scopes.mjs` dựng lại billing bridge, source graph và lifecycle từ snapshot/decisions/combined-review pin. Detail Revenue_ID phải resolve đúng physical row/hash. Total direct tự làm authoritative item; Child phải nối đúng một Total trong **cùng physical source group**, với parent service master đã resolve, cùng partner/contract/kỳ/currency/doc nguồn. Không ghép Child qua tài liệu/contract khác chỉ vì trùng tên dịch vụ.

Với layout Child, tập dòng phải đầy đủ so với các Child Approved có payable dương theo donor; thiếu/thừa, parent không duy nhất, số tiền không xác định, Total không Y, source chưa duyệt hoặc scope sai đều giữ review. Với layout Total-only, giữ Child như unused presentation evidence, không ép Invoice cũ sang layout hiện tại. Trộn Total và Child của cùng parent, lặp dòng hoặc hai current Invoice cùng claim một Total đều chặn.

Reservation từ billing bridge vẫn áp dụng cho Total và toàn bộ Child của nó. Broken/missing Revenue/Invoice links không làm nguồn trở thành chưa lập Invoice. Ba financial-link proposals chờ owner vẫn chưa áp dụng.

Mode nguồn giữ nguyên; các giá trị quan sát `CONSOLIDATED`/`all` đề xuất CONSOLIDATED, `service` đề xuất PER_SERVICE. Giá trị chưa biết giữ review. PER_SERVICE không được gộp nhiều Total service. Contract scope key còn chứa partner/kỳ/currency; không lấy contract của dòng đầu để gắn cho cả consolidated Invoice.

Scope item amount lấy nguyên Invoice_Payable_USD của Total. So sánh exact Decimal giữa captured detail sums, từng Total và Invoice header; không tính lại tỷ lệ, WHT hoặc USD từ MZN. Khác biệt do donor điều chỉnh chi tiết vẫn là evidence, không tự sửa source. Không phân bổ receipt cấp Invoice cho từng contract hoặc Child.

Raw Invoice header/details giữ canonical JSON strings với cells, actor/date/serial gốc. Proposal keys là khóa nguồn, chưa phải UUID hoặc revision FK đích. Số thứ tự scope item là thứ tự proposal, source Line_No vẫn nằm trong immutable detail evidence. Không giả thời điểm duyệt/phát hành hoặc reporting timezone.

## Chạy lại và kiểm tra

```powershell
node scripts/dgc-migration.mjs prepare-revenue-scopes --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --out artifacts/<scope-proposal.json>
node scripts/dgc-migration.mjs verify-revenue-scopes --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --proposal artifacts/<scope-proposal.json>
pnpm test:migration
```

Private proposal: `artifacts/dgc-migration/20261022/revenue-scopes/proposal.json`, hash `42e2e154e11cb9fc4dd3c28e8e5e8c73c8901f22bf2d833f06b3b5db303669cb`. Combined review pin không đổi: `e74526ef5a7baf1b6ffc8bc22029603f7c2f5d1d2b8b12a986eb88702ca4cf52`. Billing hash vẫn `1a05546085882856ad45ac6055827efc4b92e6caa6e498062e4c4e373d36d6c0`.

**20 suite migration đạt; suite mới có 193 assertions.** Kiểm Total-only/expanded Child, Paid/Issued/Draft, contract split, exact totals, unknown modes, thiếu/trùng/mixed child, parent ambiguity, cross-Invoice ownership, AR/currency/amount issues, raw date precision, archive, immutable inputs và rehashed tamper. CLI verify dựng lại toàn proposal đạt. Private `verification.json` kiểm 91 header/343 detail hashes, 261 Total-only scope items, không trùng Total trong Invoice, nguyên source snapshots và mọi activation flag đóng. Không thay app/schema/DB, không push/deploy.

Tiếp tục: triển khai historical source adapter và provenance actor/date để runtime đọc được nguồn đã nhập mà không giả approved upload; nối Invoice immutable snapshots và Total scope IDs với guard issue/payment/cancel. Sau đó diễn tập toàn chuỗi trên DB riêng với replay/rollback. Chưa chốt financial link proposals, SOA cutoff/timezone, file thiếu hoặc role provisioning.
