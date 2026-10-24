# DGC — compound child/native and captured USD rounding

Cập nhật 25/10/2026, giờ Việt Nam. Tiếp tục nhóm Paid sau profile child/native riêng. Công cụ chỉ diễn tập trên clone localhost; không có đường commit hoặc kích hoạt tài chính.

## Điều kiện chọn riêng

`invoice-child-rounding.mjs` giữ nguyên strict, V1–V4, combined evidence và child/native profile trước. Profile mới chỉ xét V1 có duy nhất `WHOLE_INVOICE_SOURCE_GROUPS_HELD`; do đó header/line arithmetic, AR, billing, scopes và reservations vẫn phải qua toàn bộ kiểm cũ. Không thay source values hoặc nới tolerance.

Mỗi source group còn held phải thuộc đúng một trong hai trường hợp: business đã REHEARSABLE và PDF chỉ có child/native hold; hoặc business có duy nhất `REVENUE_REQUIRES_REVIEW`, combined chỉ có business + child/native hold và old rounding exception plan có duy nhất `OTHER_PDF_OR_LIFECYCLE_EVIDENCE_HOLD`. Trường hợp thứ hai giữ nguyên toàn bộ kiểm USD replay/source/native của profile cũ, chỉ giải thích chỗ PDF child đã có characterization độc lập. Bất kỳ native identity issue, source issue, thiếu bytes, total khác PDF hoặc lifecycle hold khác đều tiếp tục chặn.

Tất cả child còn vướng phải có proof `CHILD_NATIVE_FALLBACK_BOUND`, đúng physical source row/hash và source detail. Async planner re-extract/kiểm bytes PDF, so child review/source links và rederive native fallback bằng profile 41/sáu held trước đó; không tin một JSON đã rehash thủ công. Cả Invoice PDF cũng được kiểm lại. Không suy actual PDF-author rounding policy, operational MZN/FX hoặc giá trị sửa chữa.

Proposal có tám Paid candidates: source Invoice rows **5, 6, 11, 15, 22, 26, 37, 41**. Năm entry V1 cùng nhóm vẫn held: **8, 12, 30, 38, 44**. Chúng có native/source issue khác, child chưa characterize, printed USD total khác hoặc thiếu PDF; profile này không bỏ các hold đó. V2 diagnostics 16/36/39 và các V4/multi-period/lifecycle cases còn worklist riêng.

Rà diagnostic V2 riêng: hàng 16 còn `OTHER_REVENUE_SOURCE_OR_NATIVE_ISSUE`/không có rounding exception đủ điều kiện; hàng 36 còn child source 297 chưa characterize. Hàng 39 có sole PDF hold trong old rounding group và child 322 đã bound, nhưng cần profile arithmetic V2 riêng trước bất kỳ trial nào; không tự thêm vào V1 hoặc báo là candidate đã xác minh.

## Lưu và đọc thử

Invoice giữ V1 arithmetic metadata đúng captured components và line propagation; thêm `DGC_CHILD_NATIVE_ROUNDING_REHEARSAL_V1` lưu original reasons, old V1 plan hash, child review pin và toàn bộ compound group proofs. `CHILD_ROUNDING_V1` là profile riêng trong unified plan, chỉ xuất hiện khi có explicit `childRoundingOptions.invoicePlanPin`. Khi không có option, kết quả/hash 21 Invoice trước vẫn giữ nguyên.

Writer chỉ nhận các compound groups từ complete Invoice set vừa rederive, không nhận một danh sách override tùy ý. Trước transaction kiểm full graph/plan; trong transaction vẫn kiểm PDF bytes/text/OCR/renders, raw DB payloads, 37 master provenance links và exact input fingerprint. Source actors không biến thành local approvers. Invoice/AR/revenue thử vẫn blocked/non-current, không cash; registry phải có toàn bộ Invoice dependencies và receipts phải gắn full parents. Transaction luôn rollback.

## Kiểm và trạng thái

Kết quả source PostgreSQL và worklist được ghi trong private `artifacts/dgc-migration/20261024/child-rounding/`; không đóng gói donor records, PDFs hoặc secrets vào release. Bộ kiểm gồm negative selection, unchanged old pins, source immutability, mid-write failure, complete replay/rollback và đọc qua historical adapters.

Clone host/Linux đã đạt **560 assertions**: cùng một transaction **29 Invoice–AR / 207 revenue / 23 documents và 23 registry links / 24 receipts trên 23 full parents**; 22 cancellation guards, zero parent shells, replay zero duplicates và full rollback. Tám Paid mới thêm 68 revenue, tám documents và tám receipts. Giữ nguyên 37 master links và 3.191 raw rows; không local approvals, cash hoặc financial commit. Đã cố ý lỗi khi ghi Invoice source 5 rồi kiểm toàn bộ model counts/provenance khớp baseline trước khi chạy lượt đầy đủ.

41 migration suites đạt, gồm 20 unit negative-selection assertions mới; 57 source assertions đạt, ghim original V1 hash và tám candidate/năm held. Hash tập 21 trước giữ nguyên `112c51edc1afef116f96cc9995580625bd13d68ad1742efeb90a6b963e1d516b`; compound plan `2172237b0f1d27d4a1519d72ae7ef1021512db5dd0fd550a7831605227bc6d0c`. Tập 29 có Invoice plan hash `66442685235b7a7d96726c9f9a6977ebce48e5178c4e06921dafe28d908e1583`, registry plan `e2263ca5cbcaffb419819f6bf124edd529e61a7110819c9c69e98b7535c1a611`.

Worklist còn 27 receipts ngoài full parents, 22 unique Invoice dependencies giữ 23 referenced documents; 22 Paid, hai Issued, năm Draft và 33 archive rows chưa thuộc tập mới. Đây vẫn là rollback trial, không phải operational acceptance. Lượt bị ngắt qua đêm khi DB disposable dừng đã không được tính là pass; lượt 25/10 chạy lại sau DB ready mới là proof hoàn chỉnh. Runtime transaction timeout/local staging guards không đổi.

Host vẫn ở mốc v14, 37 master links + 3.154 raw source rows; chưa operational financial import, real-user provisioning, SOA/UAT hoặc cutover. Master/evidence/bootstrap/seed importers tiếp tục đóng. Source phát triển trên `dgc/main`; generated `codex/dgc-deploy` vẫn một website, không redeploy host chỉ vì thay công cụ offline.
