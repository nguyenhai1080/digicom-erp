# Quyết định liên kết lịch sử và ngày chốt SOA

Ngày 23/10/2026. Owner trả lời rõ hai câu hỏi: xác nhận cả ba ánh xạ; SOA chỉ trừ khoản thu đến hết ngày chốt. Không hỏi lại hai quyết định này.

## Ba liên kết đã duyệt

1. Invoice 01/05/2024/DGC-INV, MEETME 04/2024: 49_INVOICE_DETAIL dòng 73, Revenue_ID nguồn REV0159 → 40_MONTHLY_REVENUE dòng 123/REV0419.
2. AR cùng Invoice: 50_AR_AP dòng 16, Revenue_ID nguồn REV0159 → cùng dòng revenue 123/REV0419.
3. Invoice 01/06/2024/DGC-INV, MEUCLIP 05/2024: 49_INVOICE_DETAIL dòng 78, Revenue_ID nguồn REV0419 → revenue dòng 131/REV0167.

Proposal đã duyệt có hash `c55e2c0c55a1559d7f071f45f8900c930299ed2adb61f6c95249f3fd79cf9055`, bound snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`. Approval seal `a75b0238c43d73b8192fa1d26fdbb5bc99415266d75f4a3beb8c16833833d369` ghi thời điểm nhận/áp dụng 2026-10-23T08:10:37Z. Hai PDF gốc đã được kiểm byte/SHA-256 lại trước tạo approval.

`scripts/dgc-approve-financial-links.mjs` tạo bản quyết định mới trong artifacts private; không sửa proposal cũ, source snapshot, Sheet, tiền/ngày hoặc PDF. Combined resolutions nằm ở `artifacts/dgc-migration/20261023/owner-financial-decisions/owner-decisions.json`; master quyết định cũ không đổi.

Graph chỉ nhận envelope đúng checksum/OWNER/APPROVE_ALL, snapshot/physical row/row hash/expected field value, Invoice parent và target row. Chỉ hai bảng Invoice detail/AR và trường Revenue_ID được hỗ trợ. Duplicate, unsupported field, source/target drift hoặc business context conflict bị chặn. Graph giữ legacyId nguồn, thêm OWNER_APPROVED_LINK và seal metadata; không thay cells hoặc amounts. Master plan digest không đổi.

## SOA đã chọn

`DGC_SOA_CUTOFF_POLICY=THROUGH_AS_OF_INCLUSIVE`: khoản thu có paymentDate <= ngày chốt mới giảm số dư. Ví dụ Invoice 100 USD, chốt 31/01, thu 60 USD ngày 05/02: số dư tại ngày chốt là 100 USD. Thu đúng ngày chốt được tính.

API comparison giữ hai bộ số để đối chiếu donor, nhưng cutoffPolicy không còn AWAITING_OWNER. Các trường chính thức `paidAtCutoff`/`outstandingAtCutoff` và tổng dùng through-date; UI ghi chính sách đã chốt. Không sửa paid/outstanding hiện tại, tổng receipt lịch sử, trạng thái nguồn hoặc PDF SOA cũ. Đây vẫn là màn đọc/đối chiếu, chưa có phát hành SOA/package hoàn chỉnh; includePaid của statement phát hành là lựa chọn riêng, không suy từ quyết định cutoff.

## Kết quả kiểm lại

- 24 assertions mới cho owner link approval/seals/physical rows/context/no source mutation; 64 SOA HTTP/PostgreSQL assertions đạt. API/UI build, 32 suites migration và 66 unified web/API đạt.
- Graph mới có 3 OWNER_APPROVED_LINK; unresolved references 60. Invoice history có 88 structural passed/3 review, 53 current/33 history-only/5 draft; financial review MATCH 2007/MISMATCH 123, giữ các chênh lệch nguyên trạng.
- Đã chạy lại target plan, trích/kiểm 261 PDF recon, child, OCR/custody/audit gates, Invoice restore, các rounding profiles và registry planners. Bộ mới trong `.../owner-financial-decisions/refreshed`, không ghi đè bộ cũ hoặc đổi pin thủ công.
- Revenue target vẫn 169 REHEARSABLE/96 HELD; combined evidence 147 clear-next-review/118 held; rounding revenue profile 67 candidates. Strict Invoice 4 candidates/49 held/33 archive/5 draft; Invoice rounding 8, offsetting 3, source-rounding 1. Registry V1/V2 vẫn 7/4 package candidates, còn 36 Invoice dependencies chặn 35 documents có refs, 31 no-ref riêng. V3 chưa ghép registry. Các số này là planning/trial eligibility, không phải financial acceptance hoặc import.
- Chưa ghi tài chính thật. Danh mục đã có và importer master vẫn tắt. Chính sách SOA đã triển khai/kiểm UI trên v10; [đọc lại 25 bảng/3.154 hàng nguồn khớp baseline](DGC_SOURCE_DELTA_AND_V10_20261023.md). Tiếp theo: hoàn thiện operational financial adapter với actor/date/files/receipts và đối chiếu staging; snapshot cuối/backup/restore/UAT trước cutover.
