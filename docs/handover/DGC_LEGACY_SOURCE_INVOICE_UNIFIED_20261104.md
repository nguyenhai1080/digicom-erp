# Legacy source-file Invoice 4 — 04/11/2026

**Đã hoàn tất clone host/Linux trial, exit 0, 920 assertions:** 45 Invoice–AR / 329 revenues / 40 documents / 58 registry links / 42 receipts trên 37 full parents. Invoice-4 injected write failure, replay/full rollback đạt; không tạo parent shells, cash hoặc local approval. Truy vấn độc lập sau test xác nhận Invoice/revenue/receipt/AR/cash 0, master links 37. Đây là trial, chưa operational financial import hoặc cutover.

Profile optional `LEGACY_SOURCE_FILE_V1` chỉ chọn physical source row 4 / INV0009 / 01/04/2023/DGC-INV. Nó phối hợp capsule PDF CRBT riêng, nhóm MCA qua USD-reference, ba nhóm strict và [quyết định owner giữ đúng sổ/hai PDF](DGC_INVOICE4_DOCUMENT_AUTHORITY_20261030.md). Không bật option thì hash 44-set vẫn `0246f4969917beef21beea29d67024b696c368702051a848899c70aa7e5d884d`.

Header giữ Revenue 18.644,15 / WHT 1.864,42 / Payable-paid 16.779,74 USD, ngày 05/04, hạn 20/05/2023, Paid/AR zero. V1 giữ delta 0,01 ở header và dòng MCA sau khi kiểm độc lập đủ năm dòng; bộ characterization cũ vẫn giữ trạng thái review do thiếu graph. Không sửa bộ review cũ hoặc dùng ngưỡng dung sai. Signed Revenue/ngày/hạn khác vẫn trong owner envelope, giữ cả hai file.

RPD0039/RDL0089 không tồn tại; bốn missing dependencies của Monthly/Invoice detail được giữ rõ. Hai upload có REC0040 vẫn là hai hàng khác nhau; capsule chỉ liên kết bằng full row/file/hash/period/service/contract, không chọn bằng Upload_ID. Không tạo header/detail giả. Capsule không xác nhận native identity, FX vận hành hoặc financial acceptance.

Revenue-only trial trước đó đạt 32 PostgreSQL assertions, source-file review 23 và toàn Invoice source proposal 22. Reader owner authority đạt 11, bác rehashed money/date/snapshot forgery, thiếu detail/AR/payment, đổi Invoice và checksum null. Linux full single-site build và 210 reader checks đạt; 45 migration suites đạt.

Private proof inputs nằm tại `artifacts/dgc-migration/20261030/legacy-source-file/`, trial output trong `unified/`; retained log `artifacts/dgc-migration/20261024/child-rounding/invoice-legacy-source-file-source.integration.log`. Invoice proposal hash `6b97b7c67307393626c6f7a3a602f48d813cd8108a0cbfb4a0dbaa84a84663d1`, source-file review `8bcd486a24f0ae517347479b7c5c530f06d2378c0273c8ebd84636e2f0f79839`, owner decision `bd35720cbbf02a6af2aa515c4b3154385b94df3730ce2400d6f5c9289c2655cd`.

Tất cả writer vẫn rollback-only trên localhost staging, không mở importer host, local approval hoặc cash. Kho private không vào Git/release. Draft/archive, các Paid còn held, full financial importer, source freeze/final snapshot, backup/restore, role/UAT và cutover vẫn pending. Không chuyển trial rows sang vận hành.

Proof `unified/unified-proof-1793776662297.json` và `independent-post-trial-query.json`; 35 Invoice readers, 329 revenue readers và 44 cancellation guards đạt. Unified Invoice hash `63b7b2f15328db375cac1ee5ebd44849b99e24be31010011b22dc8f0deedcdc2`, registry hash `43b03551c2a5140baabcfbf80e3dcc5fd25b484e391867757a55d98ab666ec0f`. Còn tám Paid (14/17/24/33/38/43/54/57), chín receipts, sáu Invoice dependencies/sáu referenced docs; năm Draft/33 archive chưa thuộc set. Năm original Recon vẫn thiếu, signed copies không thành original recovery.
