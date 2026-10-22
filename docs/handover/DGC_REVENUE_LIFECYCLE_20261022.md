# Đề xuất lifecycle/revision và giữ bằng chứng duyệt lịch sử

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục sau [gate evidence và audit nguồn](DGC_RECON_GATES_20261022.md). Đây là **proposal chỉ đọc, không có database writer**, không bật financial import.

## Kết quả trên snapshot

Đã dựng proposal cho đủ **265 nhóm / 409 revenue rows**, giữ business/evidence state từ bước gate:

- Hai quan hệ thay thế đối soát và **năm cặp revenue phiên bản** nối được từ audit đã bind. Không suy quan hệ từ số tiền giống nhau, tên file, ID lớn hơn hoặc cùng kỳ.
- 261 nhóm có proposal Reconciliation APPROVED theo status source; hai nhóm lịch sử bị thay có proposal SUPERSEDED; hai nhóm chưa xác định. Một nhóm trộn ba Draft child với một Approved Total, còn một revenue không có header nguồn duy nhất. Không gộp status hoặc nâng Draft thành Approved.
- Năm revenue của các tài liệu bị thay có proposal SUPERSEDED, đồng thời giữ nguyên source status Approved và Include=N trong evidence. **401 Approved revenue còn lại chưa gán status tài chính đích**; cần nối Invoice/payment/AR trước. Ba Draft revenue được giữ là evidence trước duyệt, không tự tạo revenue vận hành.
- Các local actor IDs và approvedAt đều chưa gán. Nếu diễn tập bước tiếp, trạng thái an toàn vẫn BLOCKED/isCurrent=false. Mọi nhóm/hàng giữ `readyToImport=false`; không tạo local approval hoặc hiện thực hóa revision ID.

**145 nhóm / 151 rows qua gate evidence ở bước trước không phải 261 nhóm đã được phép nhập APPROVED.** Proposal status mô tả cách ánh xạ khi các điều kiện còn lại được nghiệm thu, không thay thế business HELD, financial-chain hoặc actor/date gates.

## Căn cứ target và phần không thể đổi tên status đơn giản

Đã đọc schema `Reconciliation`, `ReconciliationItem`, `Revenue`, `OutputReconUpload`; runtime `recon-finalize.ts`, `manual-revenue.ts` và `revenue-money.ts`:

- Revenue đích không có enum Approved; các status INVOICE_READY/INVOICED/PARTIALLY_PAID/PAID phụ thuộc chuỗi tài chính. Không ánh xạ mọi Approved nguồn thành INVOICE_READY vì có thể đưa doanh thu đã lập Invoice/đã thu trở lại nguồn chưa lập hóa đơn.
- Runtime chốt PDF mới tạo local approval bằng user hiện tại/thời điểm hiện tại; manual submit chưa tạo revenue vận hành. Không gọi các generator/finalize này để dựng lại lịch sử đã chốt.
- Runtime replacement dùng SUPERSEDED cho records cũ. Với hai quan hệ có source audit rõ, proposal dùng semantics này và giữ source Cancelled/Approved/N nguyên trong JSON; không viết ngược vào Sheet hoặc tính lại tiền.
- OutputReconUpload yêu cầu local creator, attachment và dữ liệu đã được runtime kiểm. Không dựng một upload APPROVED giả để mở guard Invoice. Cần adapter nguồn lịch sử riêng và kiểm chuỗi Invoice/payment/AR trước khi kích hoạt các record nhập.
- Schema có logicalGroup/revision/supersedes nhưng sự hiện diện các field không chứng minh runtime đã nối lịch sử nguồn. Runtime finalize mới vẫn tạo logicalGroup riêng; importer phải hiện thực hóa identity/link được nghiệm thu riêng.

## Guard proposal và bảo toàn dữ liệu

`revenue-lifecycle.mjs` kiểm expected combined-review hash riêng, snapshot/target plan, đủ source groups/rows và hash nguồn. Audit chỉ dùng các event đã bind. Mỗi cặp group phải khớp partner/contract/kỳ/currency; mỗi cặp row khớp **master service nguồn và row type** duy nhất. Total/N cũ vẫn nối được Total/Y mới vì cờ cộng tháng là trạng thái nguồn được giữ, không phải khóa nhận dạng phiên bản.

Thiếu/khác scope, nhiều successor, nhiều predecessor trong khi target chỉ có một supersedes FK, duplicate edge hoặc cycle đều giữ để review và không sinh edge dùng được. Không chọn hàng đầu hoặc ghép partial row set.

`logicalSourceFamilyKey` là khóa proposal theo source family, **chưa phải UUID đích**. `capturedChainOrdinal` 1/2 chỉ là thứ tự các bản đã có evidence trong capture, không khẳng định donor chỉ từng có hai revision. Supersedes references trỏ hàng/group nguồn đã ghim; target revision mapping vẫn `accepted=false`.

Source document, từng revenue và legacy Recon được giữ bằng canonical JSON **string**, gồm cả cells, source row/hash, status, actor và serial ngày gốc. Cách này bảo toàn precision ngày spreadsheet khi sau này đi qua Prisma JSON. Không chuyển thời gian sang UTC theo một reporting timezone chưa được owner xác nhận, không map email cũ sang user hiện tại, không điền ngày duyệt bằng giờ nhập.

Hai cơ sở management và Invoice USD đều lấy lại giá trị capture, không tính lại theo tax/share/FX hiện tại. Các Total/N lịch sử không bị bỏ khỏi row evidence hoặc đổi thành Y; tổng monthly inventory trước đó không được lấy làm tổng của record lịch sử đã bị thay. Những số cũ khác PDF vẫn giữ exception, không sửa về số của bản thay thế. Không dùng MZN evidence làm money vận hành hoặc tạo cash/bank movements.

## Chạy lại và kiểm tra

```powershell
node scripts/dgc-migration.mjs prepare-revenue-lifecycle --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --review artifacts/<combined-review.json> --review-hash <sha256> --out artifacts/<lifecycle-proposal.json>
pnpm test:migration
```

Combined review pin `e74526ef5a7baf1b6ffc8bc22029603f7c2f5d1d2b8b12a986eb88702ca4cf52`. Private proposal `artifacts/dgc-migration/20261022/revenue-lifecycle/proposal.json`, plan hash `be76060c31dfa81cf29ac3682817601c2b19237d16174dda0dc4c2487f3c1b25`.

**18 suite migration đạt**, suite lifecycle mới có **52 assertions**: source/raw-float fidelity, exact revision scope, Total N→Y được giữ, inactive không có audit, duplicate/fork/single-predecessor/cycle, mixed/preapproval statuses, pinned/tampered/missing group guards và không tự gán Invoice Ready/local approval/timezone. CLI nguồn thật sinh hai Recon edges/năm Revenue edges, graph không có issue; mọi activation flag vẫn đóng. Không đổi app/schema/DB, không push/deploy.

Tiếp tục: kiểm Invoice/payment/AR theo từng physical revenue để đề xuất status đích đúng, hoàn thiện historical source adapter và actor/date policy. Rehearsal revision/attachment cần giữ rollback/replay trước bất kỳ writer commit nào. Các financial link proposals, SOA cutoff/timezone, file thiếu và role provisioning vẫn theo bàn giao, chưa được “làm tiếp” tự xác nhận.
