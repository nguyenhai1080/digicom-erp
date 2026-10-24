# DGC — original Invoice USD and native recon evidence

Cập nhật 24/10/2026, giờ Việt Nam. Đợt này bổ sung profile diễn tập riêng cho Invoice nguồn hàng 84, sau đó ghép vào lượt tài chính chung. Không sửa nguồn, suy FX, mở importer host hoặc nghiệm thu cutover.

## Bằng chứng và giới hạn

`native-usd.mjs` kiểm lại snapshot/target graph, original Recon PDF bytes, hai pass OCR, render và visual observation ghim hash. Chỉ một nhóm có đúng một Approved USD TOTAL/Y, source lifecycle active, đúng dịch vụ/kỳ, đủ header/footer, ba native components khớp nguồn và tỷ giá đã chụp lớn hơn 0 mới có thể tiếp tục. Replay cả Number donor và Decimal phải khớp từng USD component đã chụp; không tạo tỷ giá mới.

Năm scan nguồn được giữ riêng: header 256 khớp; 257–259 còn FX=0/native khác; 260 thiếu phần nhận dạng header. Không chấp nhận tên dịch vụ khác hoặc bỏ qua thiếu nhận dạng. Với header 256, graph nối đúng active detail hàng 413, không chọn bản detail cũ đầu tiên theo legacy ID trùng.

Recon scan chỉ in Payable USD; Revenue/WHT USD và tỷ giá không được đánh dấu là đã in. Original Invoice hàng 84 đã được xem trực tiếp, in đủ ba USD components; header, một dòng dịch vụ, revenue và kỳ/ngày nguồn khớp. `invoice-native-usd.mjs` kiểm riêng PDF Invoice, hash render, observation pin, full identity và từng component. Profile chỉ nhận một exact current scope/Total-only line khi original strict có duy nhất `REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD`. Mọi original state/reasons giữ nguyên.

`DGC_NATIVE_AND_INVOICE_PRINTED_USD_REHEARSAL_V1` lưu hai nguồn bằng chứng, nguồn Invoice/revenue/Recon header/detail, component comparisons và claims phân biệt rõ trường nào được in. Đây là metadata thử nghiệm; operationalUseAllowed/postingAllowed/acceptance đều false. Không tạo hỗ trợ MZN vận hành.

## Ghép bộ tài chính chung

`native-unified.mjs` tạo extension riêng từ strict/V1/V2/V3/V4 cũ và rederive native profile từ originals. Hash/kết quả plan cũ không đổi. Chặn cùng một revenue group có nhiều Invoice owners. Entry points mới cho Invoice/revenue, registry và financial set đều giữ localhost `dgc_migration_staging_*`; không có đường commit hoặc option mở gate cũ.

Nguồn revenue chỉ được thêm qua toàn bộ Invoice đã xác minh, đúng snapshot/target/decisions/company/combined review và exact group set. Mọi nhóm cũ vẫn qua kiểm strict hoặc rounding cũ; nhóm native phải thuộc Invoice candidate mới. Reverify PDF bytes, observation và plan trong transaction; registry vẫn yêu cầu đủ mọi Invoice dependency của cả tài liệu. Không đăng ký một phần tài liệu hoặc mở khoản thu trên parent shell.

Mọi target vẫn CANCELLED/BLOCKED, non-current; technical creator INACTIVE, không roles/session, chỉ tồn tại trong transaction rollback. Historical receipts giữ số nguồn, không local approver/cash.

Lượt extension trên clone host đã ghi/đọc/replay/rollback cùng một transaction: **18 Invoice–AR / 114 revenue / 12 documents và 12 registry links / 13 receipts trên 12 full Invoice parents**. Profile counts: strict 4, V1 8, V2 3, V3 1, V4 1, native USD 1. Không có parent shells, cash hoặc local approvals; 37 master links giữ nguyên. Baseline unified cũ vẫn 17/113 và hashes/gates không đổi.

Worklist extension còn 38 receipts ngoài eligible parents; 33 unique Invoice dependencies giữ 34 referenced documents. Số tài liệu chưa giảm vì các tài liệu liên quan vẫn có dependency khác còn held. Hai Issued hàng 85/86 còn evidence holds; 33 Paid, năm Draft và 33 archive rows vẫn ngoài set mới. Không dùng trial này làm operational financial acceptance.

## Kiểm đã đạt

- 44 unit assertions native/Invoice: pin/row/graph/bytes, component drift, FX=0, footer-only, duplicate scan, render/PDF tamper và input immutability.
- 20 unit assertions extension: original gates/hash không đổi, rehashed plan forgery, observation mismatch, remote/operational DB bị chặn.
- 29 source assertions: một native bound/bốn held, đúng active detail và raw FX precision; một Invoice candidate, original strict hold giữ nguyên.
- 61 synthetic PostgreSQL assertions: Invoice–AR/revenue/scope/item, replay, AR failure, target drift, mất item, PDF tamper và rollback sạch.
- 41 host-clone PostgreSQL assertions cho Invoice 84: một Invoice–AR/revenue/scope/item, replay không trùng, strict cũ tiếp tục từ chối, 37 master links không đổi và 0 financial commit.
- 319 source PostgreSQL assertions cho unified extension: 18 Invoice–AR, 114 revenue đọc qua runtime historical source reader, 12 documents/links, 11 cancellation guards, 13 exact receipts, replay/rollback và master provenance đạt.
- Hồi quy PostgreSQL strict 56, V4 118 và unified cũ 173 assertions đạt.
- Toàn bộ 39 migration suites đạt trên Node 22.

Private evidence/proofs tại `artifacts/dgc-migration/20261024/native-usd/`; không publish PDF, raw observations, snapshot hoặc dump. DB clone riêng `dgc_migration_staging_native_usd_source_synthetic` được restore từ dump post-evidence host, đủ 3.191 raw rows và 37 master links; mọi financial rows thử đều rollback.

Lần chạy unified đầu bị PostgreSQL local mất phản hồi trước transaction tài chính; không có ghi dở. PostgreSQL đã phản hồi lại, chạy lại toàn bộ đạt 319 assertions. Không khởi động lại hoặc sửa dịch vụ GST, không tác động DB host.

## Tiếp tục

Operational financial import, original files/registry, đối chiếu toàn bộ, SOA/UAT, real-user roles và cutover còn pending. Hai Issued hàng 85/86 còn evidence holds; hàng 85 đã có multi-period structure riêng nhưng FX=0/native evidence chưa đủ. Hàng 84 đủ profile diễn tập mới, chưa operational acceptance.

Host vẫn v14; evidence/master/bootstrap/seed importers đóng. Đây là thay đổi công cụ migration local; không cần redeploy ứng dụng hoặc mở importer. Nhánh deployment phải được tái sinh từ source sau kiểm, vẫn một website; không publish donor artifacts.
