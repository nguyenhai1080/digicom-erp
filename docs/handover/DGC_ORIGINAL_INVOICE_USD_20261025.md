# DGC — original Invoice USD và tập đủ tám công nợ mở

Cập nhật 25/10/2026, Asia/Ho_Chi_Minh. Owner đã [giữ phạm vi đầy đủ sổ lịch sử](DGC_FULL_LEDGER_CUTOVER_20261025.md), không chuyển sang số dư đầu kỳ/backfill.

## Bằng chứng độc lập

Đã render/xem original Invoice source rows 85/86. `invoice-usd-authority.mjs` kiểm riêng đầy đủ số/ngày Invoice, hạn thanh toán, billing range, đối tác/dịch vụ, ba USD totals và toàn bộ captured line/revenue allocations. Original Invoice USD là bằng chứng cho totals; không gắn nhãn Revenue/WHT USD đã in trên Recon, suy tỷ giá từ native hoặc chuyển MZN sang workflow vận hành.

Mọi group phải là source business REHEARSABLE, một TOTAL, và combined cũ chỉ có đúng hai USD/OCR evidence holds. Fresh original PDF bytes/renders và cả hai OCR text/TSV/render passes được kiểm lại; Recon Payable USD phải khớp source, period/scope và physical header phải duy nhất. Với Recon chỉ có footer, không khẳng định full Recon identity; original Invoice cung cấp identity riêng. Bất kỳ source business/rounding/scope/lifecycle issue khác vẫn chặn.

Hàng 85 dùng lại structural multi-period review đã rederive: header **05/2019**, ba scope **03–05/2019**, đúng captured range và graph; chỉ own other-period reservations được giải thích. USD totals in trên Invoice khớp tổng allocation nguồn nhưng **không chứng minh từng Revenue/WHT allocation theo tháng đã in trên Invoice**. Hàng 86 giữ một scope 08/2020. Không tạo local approvals, chuyển source actor thành tài khoản ký hoặc sửa source values.

Printed contract text của hàng 85 khác captured Contract_No. Metadata giữ cả hai và `legalEquivalenceInferred=false`, không sửa master hoặc gọi chúng là cùng một legal identifier. Các native/FX/rounding claims chưa đủ evidence vẫn false. Đây là profile USD/graph riêng, không xóa holds hoặc đổi hashes của native/strict/multi-period/21/29 profiles cũ.

## Kết quả kiểm

- 26 source assertions đạt: hai candidates, original strict giữ HELD, period/header/scopes đúng, source immutability, wrong amounts/dates/service/partner/covered periods và OCR pin bị giữ/từ chối.
- 20 native-unified và 20 compound unit hồi quy đạt; bộ 41 migration suites đã đạt tại checkpoint 29 trước đó, không tính lại thành suite mới.
- Clone host/Linux đạt **587 assertions**: **31 Invoice–AR / 211 revenues / 24 referenced documents / 26 registry links / 24 receipts trên 23 full parents**. Có 25 cancellation guards. Đã cố ý lỗi khi ghi Invoice 85, kiểm rollback toàn bộ/provenance, rồi chạy đầy đủ/replay/rollback sạch. Giữ nguyên 37 master links, 3.191 raw rows; không shells, local approvals, cash hoặc financial commit.
- Cả **tám Issued Invoice còn phải thu** đã nằm trong tập thử, tổng captured AR **25.328,54 USD**, từng AR component đọc khớp source. Đây chưa phải operational acceptance hoặc frozen cutover balance.

Source snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; original-Invoice USD plan `307b98851eaab3d5dfcda4b233d7735220782d05103f1e73eb02144ace55ae9f`; unified 31 Invoice plan `e1626d1def6e937cf75d6082a50da79bc38faa42844e82999d14884ec2318f92`; registry plan `0d98ef8a2f980ed211255e59fcb352e592d05546acd74aa6e16cd40193e6d1d9`. Khi không có authority option, hash 29 vẫn là `66442685235b7a7d96726c9f9a6977ebce48e5178c4e06921dafe28d908e1583`.

Files/proofs private tại `artifacts/dgc-migration/20261025/invoice-usd-authority/`; Linux runner log tại `20261024/child-rounding/invoice-usd-authority-source.integration.log`. Không đưa source records, PDF, render hoặc secrets vào Git/release. Full plan rederived trước transaction; bytes/text/renders và exact input fingerprint vẫn kiểm lại trong transaction, không cache filesystem/DB hoặc đổi local staging/timeout guards.

## Đường găng còn lại

Còn **22 Paid**, 27 receipts ngoài full parents, 20 Invoice dependencies giữ 22 referenced documents; năm Draft và 33 archive rows giữ riêng. Revenue ngoài các Invoice này, InputRecon/AP, registry/files, operational importer/reconciliation, real-user roles/UAT và snapshot cuối/backup/restore chưa hoàn tất. Host vẫn v14, financial records thực tế bằng 0, importers vẫn tắt.

Đã tìm thấy signed package source `APP0048` có sáu trang (Invoice và năm Recon), đúng năm Recon nguồn có original file IDs đang 404. Snapshot package liên kết đúng `INV0050` và cả năm `RPD0278–RPD0282`. Bản scan có header kỳ 07/2026 nhưng footer text 06/2026; giữ sự khác biệt, không sửa PDF hoặc tuyên bố đã lấy lại bytes của năm file gốc. Đây là bằng chứng bổ sung đang chuẩn bị review riêng, chưa đưa vào candidate/accepted set trên. Private renders tại `20261025/cutover/package44/`.
