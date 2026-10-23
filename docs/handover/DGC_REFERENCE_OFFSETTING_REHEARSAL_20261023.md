# Liên kết tài liệu với Invoice có line delta trái dấu

Ngày 23/10/2026. Tiếp sau [Invoice offsetting trial](DGC_INVOICE_OFFSETTING_REHEARSAL_20261023.md) và [registry rounding V1](DGC_REFERENCE_ROUNDING_REHEARSAL_20261023.md). Đã diễn tập toàn tập tham chiếu cho bốn package nguồn thật; chưa import tài chính hoặc đăng ký tài liệu vận hành.

## Phạm vi và ràng buộc

`referenceOffsettingPlan` kiểm lại original strict registration plan, Invoice rounding V1 và Invoice offsetting V2 từ snapshot/pins. Mỗi tài liệu phải đủ mọi dependency theo một trong ba profile, có ít nhất một offsetting Invoice; mọi hold về file, lifecycle và binding khác vẫn giữ nguyên. Profile V1 cũ không nhận offsetting dependency.

Nguồn thật có **bốn candidates**, physical `55_APPROVAL_PACKAGE` rows **2, 23, 27, 28**, cùng tham chiếu ba Invoice đã trial (Invoice rows 2, 23, 27). Ghép bằng sheet/row/legacy ID/hash, không theo việc số hàng tình cờ trùng nhau. **73 documents ngoài profile** gồm bảy package V1 đã trial trước, 35 documents còn dependencies held và 31 package không có captured Invoice refs; không gọi 73 là số Invoice blockers. Ba SOA vẫn held.

Runner `rehearseReferenceOffsetting` dùng lại transaction/materializer/replay/rollback và byte custody. Bộ chạy Invoice mixed kiểm riêng cả plan V1 và V2 trước chọn strict/V1/V2 entries, dùng offsetting plan hash cho định danh lượt trial. Không tự chấp nhận plan V1 do caller đưa vào chỉ vì V2 có thể rederive V1.

Documents đích vẫn DRAFT, không actor/date vận hành; Invoice/AR CANCELLED/non-current, revenue/scopes BLOCKED/non-current. Giữ source headers, related lists, approval status/actor/date trong canonical audit JSON. Không promote source Approved, tạo payment/cash/AP/local approval, đăng nhập hoặc quyền người dùng. `linkInvoiceDocuments` vận hành vẫn giữ guard ACTIVE/current; đây chỉ là registry kỹ thuật có rollback.

Đã đọc lại donor `92_Legacy_ApprovalPackage.js`: approve tìm lại related records theo kỳ/đối tác, duyệt revenue/recon, stamp người/ngày và có thể issue Draft Invoice. Không chạy hàm này để phục hồi lịch sử. Trial liên kết tài liệu chưa thiết lập runtime approval-package parity.

## Kết quả kiểm chứng

- **31 migration suites đạt**, gồm **26 planner assertions mới**: dependency closure đủ ba loại, held từng dependency, thiếu refs/offsetting, rehashed plan tamper, ba input plans bị sửa, selection trùng/held, staging guard và PDF tamper.
- **135 PostgreSQL assertions mới đạt**: SOA nguồn Draft và package nguồn Approved, mỗi document tham chiếu ba Invoice (strict/V1/V2), tổng sáu links/tám revenue. Reader thật kiểm V1/V2 và revenue; guard hủy kiểm riêng từng loại SOA/package; replay, lỗi giữa tập link, sai kind, thiếu link, document ACTIVE, input drift và PDF tamper; outer rollback về 0.
- Hồi quy PostgreSQL đạt: **107 reference V1, 76 reference strict, 104 Invoice offsetting, 96 Invoice V1 và 56 Invoice strict**. Các kiểm thử Invoice dùng đúng DB fixture theo tên được guard yêu cầu; lần gọi nhầm DB reference bị từ chối trước ghi và đã chạy lại đúng DB.
- Nguồn thật: **bốn package/bốn registry links/ba Invoice–AR, 17 nhóm/26 revenue**. Reader kiểm đủ ba Invoice, 26 revenue, bốn captured document headers; runtime cancellation guard chặn **3/3 Invoice**. Source components/paid/AR/status/headers khớp bằng private verification.
- Replay tạo 0 tài liệu/links/Invoice/revenue trùng. **23 model counts rollback khớp**, không có financial records committed. DB nguồn vẫn 19 migrations/3.154 raw/37 master links. Hai DB copy mới 24 migrations: actual giữ raw/master counts, synthetic trở về trống. Không thêm hoặc áp schema migration mới.

Private outputs: `artifacts/dgc-migration/20261023/reference-offsetting/`, gồm plan/rehearsal/runtime-proof/verification/remaining-dependencies và CLI verification. DB riêng mới `dgc_migration_staging_reference_offsetting_20261023` cùng suffix `_synthetic`, clone từ hai DB reference-rounding trước đó. Chỉ localhost 55433/container DGC, không dùng GST.

Plan hash: `dac2cf5793f80be68f0bf1216b5b1c31c8dac2fd2a8f5b7a922ce80c555c7e7e`.

Rehearsal digest: `1eb9b5f72eb51f1b1b5af01407a9333b0516b0bad049f2060b69627212407279`. Runtime proof digest: `7a3a77f54b55e04f30b59379ebb3ee59dbfc3030ebe8ed5eb1214cc9165389cb`.

## Worklist hiện hành và lệnh

Union coverage của hai profile registry: **11 package với 10 Invoice khác nhau đã được trial qua hai lượt riêng**, không phải 11 package đồng thời trong một transaction. Còn **36 Invoice dependencies** chặn **35 documents có refs**, tối đa ba documents/Invoice; **31 package no-ref** giữ riêng. Các số cũ 39 dependencies/39 documents trong bàn giao V1 là mốc trước đợt này. Worklist hash: `5801dfb3b2ec27e576f91a53bc1963ded5be4a73589f4d75950d9c27597ffd52`.

`migration:prepare-reference-offsetting`, `migration:verify-reference-offsetting`, `migration:rehearse-reference-offsetting` dùng các input reference-rounding hiện có: `--snapshot --snapshot-hash --plan --review --review-hash --manifest --manifest-hash --restore-plan --reference-review --reference-review-hash --reference-manifest --reference-manifest-hash --reference-root --registration-plan --invoice-rounding-plan --rounding-review --rounding-review-hash --exception-plan [--decisions]`.

Thêm `--offsetting-plan` là Invoice V2 plan; verify/rehearse thêm `--offsetting-registration-plan`. Prepare/rehearse có `--out` private. Rehearse thêm `--documents <sheet:row,...> --root --recon-manifest --recon-manifest-hash --recon-root` cùng DATABASE_URL staging. Không có commit path. CLI nguồn thật kiểm cả profile mới và V1 cũ; kết quả ghim trong private output, không cần DB cho verify.

Tiếp theo rà worklist 36 dependencies và historical lifecycle/actor/date/receipt adapter, giữ riêng thiếu originals, OCR một phần, native/child differences và row 21 không có line delta trái dấu. Không sửa số tiền hoặc nới gate theo tolerance chung. Sau đó đối chiếu tổng và staging UAT toàn chuỗi. SOA cutoff, reporting timezone, ba financial links và môi trường DGC riêng vẫn pending; chưa financial import, activation, push hoặc deploy.
