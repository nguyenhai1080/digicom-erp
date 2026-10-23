# Staging tài chính chung: Invoice, registry và receipt

Ngày 23/10/2026. Đây là một transaction tổng hợp trên clone host, luôn rollback; chưa nhập tài chính lên DGC thật hoặc cutover.

## Kết quả nguồn thật

Đã hợp nhất các profile strict/V1/V2/V3/V4, rederive từng profile từ snapshot và quyết định owner đang ghim. Bộ mới không đổi điều kiện cũ hoặc tự chọn subset của một tài liệu. Ngoài toàn bộ Invoice của các tài liệu đủ điều kiện, đợt này chọn thêm tất cả Invoice candidate, kể cả chưa thuộc tài liệu candidate, để kiểm cùng một lần.

Một transaction trên `dgc_migration_staging_financial_unified_source_synthetic` clone host đã ghi/đọc thử:

- **17 Invoice–AR**, gồm 4 strict, 8 V1, 3 V2, 1 V3 và 1 V4; 13 Invoice exception được internal reader kiểm lại.
- **113 revenue** của nguyên các nhóm nguồn, internal source reader đọc đủ; không đổi captured components, actor/date hoặc quyết định owner.
- **12 documents / 12 registry links**, giữ Draft/Approved nguồn trong evidence, mọi target Document vẫn DRAFT. Guard hủy chặn đúng 11 Invoice có registry được tạo trong lượt này.
- **13 source receipts / 12 parent Invoice**, liên kết vào chính các Invoice đầy đủ AR/scopes/revenue phía trên, **không tạo parent shells**. USD/VND/FX đọc lại đúng precision nguồn, approvedById/cashAccountId vẫn null và không có cash posting.

Replay không tạo Invoice, document/link hoặc receipt trùng. Footprint trước/sau rollback khớp toàn bộ 25 nhóm bảng theo dõi, giữ nguyên 37 master links và toàn bộ raw staging. 310 assertions trên nguồn thật đạt; financial rows committed và remote changes đều 0. Không promote source Approved, fake approver, tạo user roles/session hoặc áp historical receipts vào cash ledger.

Receipt writer chỉ chạy bên trong transaction đang bắt deliberate registry rollback; kiểm lại đầy đủ parent provenance/header/AR/paid total, exact source receipt set và raw rows. Lượt này không cập nhật trạng thái paid của parent vì chúng đã giữ nguyên số paid nguồn; receipts chỉ xác minh chuỗi đầy đủ, không gọi live receipt writer hoặc sync cash.

## Kiểm và công cụ

`invoice-unified.mjs` rederive cả năm profile. `reference-unified.mjs` đòi đủ mọi dependency của mỗi document. `financial-set.mjs` nối transaction registry với receipts, chỉ có rollback path và localhost guard. Hai profile cũ của registry và regular Invoice rehearsal không nhận additional Invoice selection; tùy chọn thêm Invoice chỉ có ở profile unified và vẫn phải thuộc candidate set được rederive.

- 25 planner assertions: cả năm profile trong cùng hai tài liệu, AR lỗi tại bất kỳ Invoice nào giữ cả tài liệu held, no-ref/forged plan và remote DB bị chặn.
- 173 PostgreSQL assertions synthetic: 5 Invoice, 16 revenue, 2 documents/10 links, 2 receipts; có source VND phần lẻ và FX 12 số. Lỗi ghi giữa receipt hoặc registry rollback toàn bộ; chọn Invoice held bị chặn.
- 35 migration suites đạt. PostgreSQL hồi quy registry strict/V1/V2 đạt lần lượt 76/107/135 assertions.

Root commands `test:migration:financial-set` và `test:migration:financial-set-source` chạy fixture hoặc clone host riêng. Source test chỉ nhận DB có tên chính xác như trên, dùng owner decision envelope 23/10 và các pins/PDF gốc hiện hành. Không thay guard cũ để chạy remote; không mở master importer.

Private proof: `artifacts/dgc-migration/20261023/financial-unified/proof-*.json`, `invoice-plan.json`, `reference-plan.json`, `remaining-worklist.json`, logs. Không publish các artifacts này. API/UI/schema không đổi trong đợt này; host vẫn v12, không cần redeploy cho migration scripts hoặc tài liệu audit.

## Worklist còn lại và phát hiện mới

Trong 91 Invoice, unified set có 17 candidates; phần còn lại gồm 33 Paid, 3 Issued, 5 Draft và 33 Superseded/Cancelled. **38/51 receipts** còn nằm ngoài set vì full parent Invoice chưa qua các gate; đây không phải 38 receipt amount errors. Registry còn 34 unique Invoice dependencies chặn 34 documents có refs, giảm từ 36/35; 31 package no-ref vẫn giữ riêng. Không diễn giải 17 Invoice hoặc số assertions thành tỷ lệ nghiệm thu toàn migration.

Đã dùng quy trình PDF kiểm lại năm scans và original Invoice nguồn hàng 85. Invoice 85 in rõ kỳ billing 01/03–31/05/2019, trong khi header nguồn lấy kỳ cuối và ba revenue giữ từng kỳ; cần hỗ trợ historical multi-period, không sửa raw kỳ hoặc đoán Revenue links khác. Scan CRBT ba kỳ có Exchange_Rate=0 trong snapshot và native source values không khớp số in native; Payable USD khớp nhưng không được tự dựng lại tỷ giá/native values. Original Invoice có đủ ba header USD components để đối chiếu tổng; chưa dùng điều đó để tự bỏ gate của từng revenue. Scan hàng 256 khớp cả ba native components và donor replay từ captured rate; scan hàng 260 cũng khớp số nhưng file nguồn chỉ có footer, identity coverage vẫn chưa đủ. Không coi Revenue/WHT USD hoặc FX không được in trên scan là đã quan sát trực tiếp.

Những quan sát này đã ghim ở private `visual-observations.json` (render/PDF/source row hashes); chưa tạo profile/gate override, sửa dữ liệu hoặc tuyên bố nghiệm thu ba Issued còn held. Đường tiếp theo là hoàn thiện staging/import vận hành và nguồn evidence có thể review trong ứng dụng, giải quyết historical multi-period/scan evidence, rồi đối chiếu/UAT/snapshot cuối trước cutover.
