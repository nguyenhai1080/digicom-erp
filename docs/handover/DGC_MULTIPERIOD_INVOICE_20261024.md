# Invoice lịch sử nhiều kỳ — 24/10/2026

## Kết quả

Đã bổ sung lớp đọc và diễn tập riêng cho Invoice nguồn có khoảng billing nhiều tháng. Invoice hàng 85 giữ nguyên `Revenue_Month=2019-05`, khoảng billing 01/03–31/05/2019, ba doanh thu và ba InvoiceScope tháng 03/04/05. Không lấy tháng đầu ghi đè kỳ header, không gộp lại tiền hoặc dựng tỷ giá cho các scan CRBT có FX=0.

Trên clone backup host mới, đã ghi/đọc thử **một Invoice–AR, ba revenue và ba scopes/items**, replay tạo 0 trùng rồi rollback toàn bộ. Vẫn đủ 37 master links / 3.191 raw rows; không có tài chính committed hoặc thay đổi trên host. Đây là profile **MULTIPERIOD_STRUCTURE_ONLY_FINANCIAL_HOLDS_RETAINED**, chưa thuộc unified candidate set và không có đường commit.

## Bằng chứng và quy tắc

Donor v61 `40_Invoice_Core.js` lưu Billing_Period_Start/End tại dòng 200–201, generator thường tạo một tháng tại 798–800; `41_Invoice_PDF.js:74` in chính khoảng ngày đó. Snapshot lịch sử hàng 85 đã có khoảng ba tháng, được original Invoice PDF xác nhận. Không sửa nguồn hoặc biến generator Invoice mới thành công cụ tái tạo lịch sử.

`invoice-multiperiod.mjs` kiểm lại full snapshot, toàn bộ Invoice PDF manifest/bytes, đúng row hash/file ID/PDF hash/render hash, số Invoice, ngày, ba tổng USD và tên dịch vụ in trên PDF so với Recon detail nguồn. Khoảng ngày phải đủ đầu/cuối tháng, thứ tự đúng, có kỳ header bên trong và đủ mọi tháng; không suy range còn thiếu từ các detail.

Mỗi detail phải có graph link chính xác tới Invoice, revenue, service, Recon document/detail; partner/currency/contract phải khớp. Chỉ nhận diện false reservation khi detail thuộc **chính Invoice đang xét**, nối chính xác tới revenue cùng dịch vụ/hợp đồng/đối tác ở tháng khác trong range. Tham chiếu không rõ, Invoice khác, duplicate coverage, thiếu tháng hoặc tranh chấp TOTAL vẫn held.

Source review giải thích hai INVOICE_AND_SOURCE_SCOPE_CONFLICT và một SOURCE_SCOPE_RESERVED_OR_REFERENCED_ELSEWHERE của hàng 85. Projection riêng đề xuất INVOICED cho ba authoritative TOTAL sau khi kiểm đầy đủ các dòng trình bày và trạng thái/balance nguồn; không thay classification, status hoặc hash của billing/scope/restore/unified plan cũ. Original RESTORE_HELD và original reasons vẫn được lưu.

Profile hiện chỉ diễn tập một contract scope cho mỗi tháng. Metadata `DGC_MULTIPERIOD_STRUCTURE_REHEARSAL_V1` giữ review pin, range, kỳ header, ba kỳ và financial hold; mọi target Invoice/AR vẫn CANCELLED/non-current, scope/revenue vẫn BLOCKED/non-current, không source approval/local approver/cash. Technical creator chỉ tồn tại trong transaction rollback, INACTIVE, không roles/session.

## Kiểm tra

- 59 unit assertions: range, leap year, PDF/row/render pins, service identity, complete coverage, external Invoice, duplicate detail, amount drift, input immutability và strict plan không đổi.
- 31 source assertions: nguyên PDF/bytes và snapshot thật; chỉ hàng 85 có captured multi-period range trong 91 Invoice; ba scope đúng kỳ, kỳ header giữ 05/2019.
- 63 PostgreSQL assertions synthetic: lưu/đọc/replay, forged pin, lỗi AR giữa lượt, target drift, mất scope item, PDF tamper và rollback sạch.
- 45 PostgreSQL assertions trên clone host thật: một Invoice–AR / ba revenue / ba scopes; ordinary strict trial vẫn từ chối hàng 85, 37 master links không đổi, tài chính committed bằng 0.
- Hồi quy PostgreSQL strict 56 và V4 118 assertions đạt; toàn bộ 37 migration suites đạt.

Private proofs tại `artifacts/dgc-migration/20261024/multiperiod/`: source-review/source-proof/source-trial-proof, logs và raw source evidence. Không publish các artifacts này. Các lệnh root mới: `test:migration:multiperiod`, `test:migration:multiperiod-source`, `test:migration:multiperiod-source-staging`.

## Phần chưa xong

Trong proposal mới, hàng 85 còn `REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD`: scan từng kỳ chỉ in Payable USD; Revenue/WHT USD từng kỳ và native/FX nguồn chưa đủ bằng chứng cho toàn chuỗi. Giữ những trường không in ở trạng thái chưa xác minh, không suy tỷ giá, tự điền native values hoặc suy phân bổ từ tổng Invoice. Những PDF/native observations đã ghim không phải phê duyệt tài chính.

Unified staging vẫn 17 Invoice–AR / 113 revenue / 12 documents / 13 receipts; ba Issued vẫn chưa được nghiệm thu tài chính. Operational importer, files/registry, đối chiếu toàn bộ, SOA/UAT/roles và cutover vẫn pending. Host vẫn v14; source/master/seed/bootstrap importers đều đóng. Thay đổi đợt này chỉ ở công cụ migration, không cần redeploy ứng dụng hoặc mở importer.
