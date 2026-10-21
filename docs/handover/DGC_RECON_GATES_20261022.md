# Hợp nhất evidence đối soát và kiểm vòng đời nguồn

Ngày 22/10/2026, giờ Việt Nam. Tiếp nối [OCR/Child](DGC_RECON_OCR_AND_CHILD_20261021.md), [bảng tổng USD](DGC_RECON_SEMANTICS_20261021.md) và [rehearsal](DGC_REVENUE_REHEARSAL_20261021.md).

## Kết quả theo nhóm

Đã nối đầy đủ target plan, custody, bảng tổng USD, dòng con, OCR và source lifecycle bằng physical row/hash. Toàn bộ **265 nhóm / 409 revenue rows** được giữ:

| Phạm vi sau kiểm evidence | Nhóm | Revenue rows |
| --- | ---: | ---: |
| Có thể sang bước rà soát kế tiếp | 145 | 151 |
| REHEARSABLE cũ, nay giữ thêm vì evidence | 24 | 54 |
| Business HELD cũ, giữ nguyên | 96 | 204 |

Trong 24 nhóm mới giữ thêm: 10 nhóm child chưa khớp, bốn nhóm có chuỗi tham chiếu cần rà soát, chín nhóm chưa đủ tổng USD (ba thiếu PDF, sáu scan mới chứng minh Payable) và một nhóm có số tổng USD khác PDF. Các reason chi tiết có thể chồng nhau; không cộng reason counts để tính số nhóm.

`EVIDENCE_CLEAR_FOR_NEXT_REVIEW` **chưa là quyền nhập tài chính**. Tất cả giữ `readyToImport=false`, `postingAllowed=false`, `acceptance=false`. Còn target lifecycle/revision, actor/date lịch sử, Invoice/payment/AR và nghiệm thu tài chính cuối. 94 child rows khớp native + USD capture link chưa có nghĩa USD child đã được in/xác minh trực tiếp trên PDF. OCR Payable không thay thế các cột USD hoặc nhận dạng còn thiếu.

## Cancelled header và Approved revenue là mẫu donor có chủ ý

Đã đọc donor v61 `20_Recon_Core.js::DGC_markReconChainSupersededV81180_` và các hàm chain/replacement/preflight:

- Payment hiện diện trong chain chặn replacement, kể cả một payment row có amount bằng 0. Không tự bỏ payment theo status/amount hoặc suy thời điểm phát sinh.
- Header cũ chuyển Cancelled; các revenue giữ status cũ và được đặt `Include_In_Monthly_Total=N`; các legacy Recon chuyển Cancelled.
- Invoice chưa thu có thể tạm current và được gắn Needs_Regeneration cho engine revision. Invoice đã Superseded không còn là current theo guard này.
- Source audit lưu tài liệu thay thế, bộ revenue/recon và các **current invoices tại lúc event**. Mảng invoice rỗng không có nghĩa chain chưa từng có Invoice lịch sử.

Hai chain Cancelled trong snapshot khớp mẫu bất hoạt: năm revenue vẫn Approved nhưng cờ tháng N, năm legacy Recon Cancelled, không có payment được capture. Một chain có Invoice Superseded/isCurrent=false, chain kia không có Invoice capture. Vì vậy, tổ hợp status được nêu ở bàn giao trước là trạng thái cần đọc theo donor, **không tự kết luận là lỗi dữ liệu hoặc sửa Approved thành Cancelled**. Các chênh lệch số tiền/PDF của những hàng này vẫn được giữ riêng.

`recon-lifecycle.mjs` giữ toàn bộ chain candidate, kiểm unique/reference conflicts và exact token. Không dùng substring `DOC` để gắn nhầm `DOC_LONG`. Membership có ID trùng/context conflict được giữ với issue, không chọn hàng đầu. Đã phát hiện tám chain có unresolved references, ba chain có invoice-detail document conflict và hai chain có duplicate revenue ID; đây là các tập chồng nhau. Bốn nhóm từng REHEARSABLE bị giữ thêm bởi phần chain này. Không áp ba financial link proposals đang chờ owner.

## Bằng chứng audit bổ sung, đọc riêng ngày 22/10

Đã dùng Google Drive/Sheets **chỉ đọc** đúng workbook nguồn đã định danh. Metadata xác nhận `12_SYS_AUDIT_LOG`; đọc header, tìm action `SUPERSEDE_RECON_CHAIN_V81180` trong cột D với bound **1.409 cells**, trả hai kết quả, không truncated; chỉ đọc chín cột của hai hàng kết quả. Không đọc/ghi bảng cấu hình hoặc chạy donor audit/repair/migration functions.

Hai event nêu rõ old/new Recon document và bộ revenue/recon. Reader đã nối cả hai với đúng header vật lý/hash trong snapshot và kiểm bộ ID khớp, cùng partner/service/period theo key donor. Kết quả **hai `SOURCE_REPLACEMENT_EVENT_BOUND`**. Đây là bằng chứng quan hệ thay thế trong source, chưa phải `targetRevisionMappingAccepted` hoặc local approval.

Capture bổ sung được ghim hash, có request, metadata, headers, search coverage, physical rows/cells và observed time riêng. **Không trộn hai hàng audit vào snapshot cũ**, không tăng 3.154 raw staged rows hoặc sửa hash snapshot. Raw actor/timestamp được giữ như nguồn; không tạo local user/approver và không áp timezone của workbook cho reporting timezone công ty. Đây là quan sát nguồn ở lần đọc bổ sung, không chứng minh snapshot/Drive revisions đã frozen hoặc log không từng bị sửa.

`recon-audit.mjs` kiểm pin, workbook/sheet identity, action/entity, literal JSON payload, bounded/full search coverage, physical row requests, duplicate events và old/new source sets. Payload không khớp hoặc thiếu tài liệu được giữ ở trạng thái cần review; audit không mở business HELD hoặc bỏ gate inactive/history. Key normalization chỉ dùng để rà soát quan hệ donor, không tạo master alias mới.

## Reader hợp nhất và cách chạy

`recon-gates.mjs` kiểm pin **riêng** cho summary/child/OCR, snapshot/target/manifest; kiểm đủ mọi physical source row, không trùng, đúng hash và PDF binding. Source PDFs được verify lại từ disk; child entries được dựng lại từ nguồn pinned; OCR report được dựng lại với các artifact hiện có để phát hiện byte drift. Source lifecycle dựng mới từ snapshot, audit supplement gắn riêng. Tất cả business HELD và reason gốc vẫn giữ.

```powershell
node scripts/dgc-migration.mjs review-recon-gates --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --manifest artifacts/<source-manifest.json> --manifest-hash <sha256> --root artifacts/<source-recons> --summary artifacts/<summary-review.json> --summary-hash <sha256> --child artifacts/<child-review.json> --child-hash <sha256> --ocr-review artifacts/<ocr-review.json> --ocr-review-hash <sha256> --ocr-manifest artifacts/<ocr-manifest.json> --ocr-manifest-hash <sha256> --ocr-root artifacts/<ocr-evidence> --audit artifacts/<supplemental-audit.json> --audit-hash <sha256> --out artifacts/<combined-review.json>
pnpm test:migration
```

`--audit`/`--audit-hash` là cặp bổ sung tùy chọn; thiếu audit không xác lập quan hệ replacement. Reader CLI chỉ dùng các file đã có trong private artifacts, không tự gọi connector hoặc thực thi source. Bộ input hiện tại đã có đủ evidence local để chạy lại, không cần đọc live lần nữa.

Private output `artifacts/dgc-migration/20261022/recon-gates/review.json`, review hash `e74526ef5a7baf1b6ffc8bc22029603f7c2f5d1d2b8b12a986eb88702ca4cf52`. Supplemental capture `audit-capture.json`, hash `9fd38cb405e515889cb8d85cf2d34848ed55a59d1935815b4f467297bab1df84`. `review-before-audit.json` giữ kết quả bước trước để đối chiếu; các state/counts theo nhóm không bị audit tự mở. Raw audit, email/actor, payload, report và originals không đưa vào Git.

**17 suite migration đạt**, gồm **104 assertions mới**: 31 lifecycle, 40 combined gate và 33 audit binding. Kiểm Cancelled/Approved/N theo donor, zero payment lock, Needs_Regeneration/current flags, ID token boundaries, coverage/tamper/pins, child replay, OCR không thay tổng, giữ business HELD, source audit sets và không tạo approval. Đã chạy CLI trên các file thật; không đổi app/schema, không gọi DB, nhập tài chính, push hoặc deploy.

Tiếp tục: dùng 145 nhóm / 151 rows làm phạm vi rà soát target lifecycle/revision/actor-date và chuỗi Invoice/payment/AR; giữ riêng history bị thay, các chênh lệch và unresolved references. Năm file Drive chưa truy cập, ba financial link proposals, SOA cutoff/reporting timezone và provision người dùng thật vẫn theo bàn giao hiện hành. Source audit đã có evidence cho hai quan hệ thay thế; mapping/import/approval đích vẫn cần hoàn thiện và nghiệm thu.
