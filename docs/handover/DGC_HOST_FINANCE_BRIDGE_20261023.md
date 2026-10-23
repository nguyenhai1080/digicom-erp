# Nối danh mục host với staging tài chính và kiểm storage v11

Ngày 23/10/2026. Không có financial import chính thức hoặc cutover trong đợt này.

## Lỗi đã sửa và kiểm trên bản phục hồi host

Danh mục thật đã có 37 provenance links dưới hash gói master `426f0799…`; snapshot tài chính đầy đủ có hash `47b65e21…`. Invoice rehearsal trước đây lọc mọi dependency bằng snapshotHash tài chính, nên không tìm được partner/contract đã nhập thật dù physical rows và target đều khớp. Không được sửa hash/link trong DB để vượt lỗi này.

Invoice rehearsal giờ dùng master resolver chung với revenue. Resolver kiểm đúng model, sheet ID/physical row/legacy ID/row hash, manifest nguồn, raw staged payload, quyết định danh mục, dependency và target hash. Gói master-only phải có đúng sourceSnapshotHash/planHash/decisionsHash, masterOnly=true, financialRecordsIncluded=false và rowCount đúng. Provenance full snapshot cũ chỉ được tái sử dụng khi source identity/calendar/capture metadata hợp lệ, raw row vẫn khớp và target/mapping không đổi. Không rebase approval hoặc chuyển link sang snapshot khác. Revenue dependency vẫn đòi đúng snapshot tài chính.

DB riêng `dgc_migration_staging_host_finance_synthetic` được clone từ bản phục hồi backup DB host sau master. Giữ nguyên 10 services/4 partners/9 contracts/14 links và tài khoản/quyền đã có; không gán quyền hoặc đăng nhập bằng dữ liệu trong backup. Chỉ stage thêm 3.154 raw rows local, replay staging không trùng. Đây là evidence, không phải sổ tài chính.

`scripts/dgc-migration/host-finance-staging.integration.mjs` dùng bộ quyết định owner/plan mới, chạy trọn bốn Invoice còn phải thu ở source header rows 78/80/81/82 cùng revenue/scope/AR. Kết quả 4 created ở transaction, replay 0 created/4 unchanged, rollback toàn bộ 29 model counts; 37 master links vẫn nguyên vẹn. Không payment/cash hoặc local approval. Technical creator của rehearsal là INACTIVE, không roles/session và cũng rollback. Bốn Invoice thử vẫn CANCELLED/noncurrent, không biến thành Invoice vận hành.

48 assertions đạt, gồm sai expected model sau cache hit, giả manifest snapshot/plan/decisions/rowCount/masterOnly và sửa raw payload đều bị chặn. Đã chạy lại trên cùng DB clone: staging replay và trial tiếp tục đạt. Proof private `artifacts/dgc-migration/20261023/owner-financial-decisions/host-finance-staging-proof*.json`.

Hồi quy full-snapshot cũ: 56 Invoice/AR PostgreSQL + 217 revenue PostgreSQL đạt, kể cả nguồn mới dùng lại master unchanged, target/source drift và failure rollback. 32 migration suites và 24 owner-link assertions đạt. Localhost/database guards không đổi; không có production commit path mới hoặc schema migration.

## Storage host đã kiểm

V11 đã online, cùng deploy commit `a66f1aa72440c39a5f588c092b49cf4379f59f61`/source `8e21097`. Redeploy có chủ đích để kiểm volume; không deploy các script/docs mới. Health/public route trả 200. V10 ghi marker `created`; runtime v11 lúc `2026-10-23T10:22:42.481997665Z` ghi **preserved**, cùng ID `330711dc-3bf0-452d-b703-a407e230074f` và createdAt `2026-10-23T09:59:10.583Z`. Đã chứng minh file còn nguyên sau thay container.

Website backup v11 thành công lúc 17:26 giờ Việt Nam. Khi tải đã bỏ chọn `.env`; không lấy secrets về để kiểm storage. Gói private `artifacts/dgc-deploy/20261023/dgc-v11-source-storage-no-env.tar` 754.688 bytes, SHA-256 `12811adefc1866ab7de908b7b7f53ec2a185aae338c7b1bb593841522ed6b867`.

`scripts/dgc-storage-backup-check.py` kiểm đúng Digicom-Erp, no-env, source commit, hai part size/hash và appdata mount `/app/storage`; kiểm 119 source files và một regular storage file là marker. Chỉ restore marker vào folder local mới, không extractall hoặc chạy source. Byte/SHA-256 marker khớp log v10/v11; proof ở `artifacts/dgc-deploy/20261023/storage-restored-v11-verified/proof.json`. 14 tests đạt cho project/env/hash/path/duplicate/missing marker/wrong date/commit/mount/destination. Chưa phải full application/config restore hoặc restore PDF tài chính: host chưa có financial PDFs để kiểm.

Ảnh private `dgc-v11-storage-preserved.png`, `dgc-v11-backup.png` trong cùng thư mục deploy. Browser timeout đợt trước đã hết; không còn là blocker hiện hành.

## Đường găng còn lại

- Tám Invoice nguồn đang Issued: bốn strict đã thử trên clone host như trên. Rows 79/84/85/86 vẫn held qua cả strict, rounding, offsetting và source-rounding profiles. Row 79 có finance/source review; 84/86 có scan chỉ quan sát được Payable USD; 85 thêm scope/billing review. Không tự coi thiếu Revenue/WHT USD trên scan là đã đối chiếu đủ.
- Nguồn có 51 receipts, bốn Paid_Amount_VND có phần lẻ; schema/runtime VND hiện yêu cầu số nguyên. Đã đọc donor v61 `51_Payment_Transaction.js`: writer mới round VND và tự đồng bộ cash, nhưng migration theo quyết định owner không được làm tròn lịch sử hay chạy đồng bộ cash. Receipt actor/date/source/precision còn cần adapter riêng; không dùng endpoint nhập lịch sử hiện hành để tạo lại nguồn bằng local approver giả.
- Hoàn tất importer tài chính vận hành, full registry/files/receipts, đối chiếu tổng và UAT; sau đó snapshot khóa cuối/backup DB và file thực tế/go-no-go. Bằng chứng storage marker và bốn Invoice rollback không thay nghiệm thu tài chính hoặc cho phép bỏ các khoản còn review.
