# ERP DGC: một website và chuẩn bị cắt chuyển trong ngày

Quyết định owner 23/10/2026: gộp web/API thành **một website**, giảm số dịch vụ host; báo cáo dùng **Asia/Ho_Chi_Minh**, vận hành USD/VND, mặc định USD. Owner đặt mục tiêu cắt chuyển xong hôm nay. Đây là kế hoạch thực thi có điều kiện, chưa phải xác nhận đã cutover.

Repo owner cung cấp: `https://github.com/nguyenhai1080/digicom-erp.git`, branch `dgc/main`. Không dùng upstream/DB/storage/secret GST. Kiểm read-only repo ban đầu không có refs. Connector Vibehost ngày 23/10 vẫn chỉ thấy hai dịch vụ GST, khác ảnh owner có ba website; phải kết nối đúng tài khoản DGC trước thao tác host.

## Owner chuẩn bị ngay

1. Trong đúng tài khoản host DGC, tạo **một website `dgc-erp`** từ repo trên, branch **`codex/dgc-deploy`**, thư mục build gốc `/`, Dockerfile gốc `Dockerfile`, cổng container **3000**. Nhánh mã nguồn `dgc/main` vẫn bị bộ quét GitHub của host nhận apps/api + apps/web thành hai dự án; branch deploy đã bỏ cấu trúc này, chỉ còn một ứng dụng Fastify và UI build sẵn trong public. Dùng URL HTTPS tạm của host để UAT trước khi chuyển domain.
2. Tạo PostgreSQL DGC riêng (nền địa phương đang dùng PostgreSQL 16), database/user/secret riêng. Gắn DB bằng biến môi trường bảo mật của website; không restore DB GST làm nền DGC. PostgreSQL là dịch vụ dữ liệu, không phải website thứ hai.
3. Gắn ổ lưu trữ bền vững riêng vào **`/app/storage`** của website. PDF, logo, stamp và ảnh ký cần còn nguyên sau restart/redeploy. Không chỉ lưu trong filesystem tạm của container.
4. Nhập cấu hình dưới đây vào phần environment/secrets của host, thay các placeholder bằng thông tin DGC thật. Không gửi mật khẩu/token trong chat hoặc commit chúng vào repo.

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://<URL-HTTPS-CUA-WEBSITE-DGC>
APP_NAME=DGC Finance
APP_TITLE=DGC Finance
DEFAULT_COMPANY_CODE=DGC
DEFAULT_COMPANY_NAME=<TEN-PHAP-NHAN-DGC-DA-XAC-NHAN>
DEFAULT_COMPANY_CURRENCY=USD
DEFAULT_COMPANY_TIMEZONE=Asia/Ho_Chi_Minh
DATABASE_URL=<URL-POSTGRESQL-DGC-RIENG>
SESSION_SECRET=<CHUOI-NGAU-NHIEN-RIENG-TOI-THIEU-32-KY-TU>
STORAGE_PROVIDER=local
STORAGE_ROOT=/app/storage
ERP_STORAGE_PROBE=true
ERP_SEED_ON_START=false
AUTH_BOOTSTRAP_ENABLED=false
```

`ERP_WEB_ROOT=/app/public` đã đặt trong Dockerfile của branch deploy; nếu host đã có giá trị cũ `/app/apps/web/dist`, cần đổi sang `/app/public`. Không cần `API_BASE_URL`, website proxy hoặc biến VITE API host. `APP_URL` là URL website người dùng truy cập, gồm scheme HTTPS, không thêm đường dẫn. Khi đổi domain cuối, cập nhật APP_URL và kiểm lại đăng nhập.

5. Kết nối connector đúng tài khoản DGC và cung cấp website/project ID, URL HTTPS cùng xác nhận DB/volume đã gắn. URL Git đã có. Thông tin này đủ để tiếp tục cấu hình/kiểm tra, không cần gửi bí mật. DNS chỉ chuyển sau khi các gate bên dưới đạt.

## Kiến trúc đã chuẩn bị trong code

Cập nhật đóng gói sau ảnh owner báo host tạo hai dự án: `scripts/package-single-site.mjs <artifacts/output-moi>` tạo tree triển khai phẳng từ API source/assets, UI Vite đã build và database library/schema/migrations. Chỉ root package có Fastify, không có workspaces/apps hoặc Vite package. Dependency trực tiếp được ghim theo phiên bản đã cài/kiểm trong checkout; tạo package-lock và build Docker Node 22 trước khi publish. Nhánh phát triển dgc/main giữ nguyên; nhánh deploy codex/dgc-deploy phải được tái tạo/kiểm/publish sau mỗi thay đổi mã nguồn, không tự đồng bộ khi chỉ push dgc/main. DEPLOYMENT.json ghi source commit, không chứa source tài chính/secrets.

Root Dockerfile build cả API và Vite UI. Một Fastify/Node process phục vụ UI tại `/`, file build và các SPA paths; `/api/v1/*` vẫn dùng chính API handlers/quyền/CSRF/upload/download hiện có. `/api/v1/health` kiểm DB. Không có reverse-proxy Node thứ hai. Static fallback không trả HTML cho unknown API paths, không phục vụ dotfiles/source maps hoặc symlink thoát thư mục UI.

Chế độ API riêng khi không cấu hình ERP_WEB_ROOT giữ hành vi cũ. Timezone mặc định seed DGC và hai env templates đã đổi theo quyết định mới; không tự sửa serial ngày/actor nguồn hoặc tenant đã tồn tại.

API/UI build và **66 kiểm tra unified web đạt**, gồm cả output Vite thật, asset cache, API auth/health, bootstrap tắt, đường dẫn, file bí mật thực sự tồn tại/symlink ra ngoài và chế độ API cũ. DGC seed/auth preflight cũng đạt sáu tình huống từ chối trước truy cập DB.

**Docker build và production smoke địa phương đã đạt**: root Dockerfile build được trên Linux, khởi động với NODE_ENV=production trên cổng loopback 55441 và DB DGC disposable riêng 24 migrations. UI thật tại `/`, JS assets, deep link, public config DGC, health query PostgreSQL thật, API 401/404 và HEAD đều đúng trên cùng cổng. `docker top` xác nhận đúng **một tiến trình `node start.mjs`**. Volume Docker gắn `/app/storage`; file fixture còn nguyên sau restart và đã xóa, health/UI đọc lại sau restart đạt. Không chạy seed/bootstrap, không nhập tài chính; container smoke đã dừng. Redeploy/backup/restore và UAT trên host thật vẫn phải kiểm riêng.

Private logs/proof: `artifacts/dgc-deploy/20261023/unified-build.log` và `unified-smoke.json`. Không ghi secrets vào log/proof; build/smoke thành công không thay thế UAT tài chính.

## Đường găng tới cutover

| Bước | Điều kiện hoàn tất | Hiện trạng khi lập kế hoạch |
| --- | --- | --- |
| Môi trường đúng DGC | Repo/website/DB/volume/HTTPS đúng tài khoản, backup hoạt động | Repo đã cung cấp; owner xác nhận chưa có môi trường đích |
| Khởi tạo ứng dụng | Schema trên DB trống; seed DGC một lần; bootstrap admin ngắn hạn rồi tắt; kiểm tenant DGC | Chưa chạy từ xa; không seed tự động khi restart |
| Nhập staging thực sự | Quy trình commit/replay/rollback cho tài chính, lifecycle/actor-date/file/receipt mapping đủ; owner decisions bound đúng snapshot | Hiện mới master staging và financial rollback trials; chưa có importer vận hành hoàn chỉnh |
| Đối chiếu | Row counts, Revenue/WHT/Payable/paid/outstanding/AR/AP/receipts theo kỳ/đối tác/tiền tệ khớp, mọi ngoại lệ có disposition rõ | Còn blockers; không coi riêng test/PDF custody là đã đối chiếu xong |
| UAT kế toán | Login/quyền, FX, input/output recon, invoice/PDF, AR/AP/thu, SOA/báo cáo và restart/storage kiểm trên môi trường DGC | Chưa UAT đích; SOA cutoff/full roles và một số parity còn pending |
| Snapshot cuối và chuyển | Chốt giờ dừng ghi nguồn, xuất snapshot cuối/delta có kiểm, backup DB/files và restore thử, số dư tiền đầu kỳ, chuyển domain và kiểm | Snapshot 19/10 là nhiều lần đọc, chưa atomic; chưa được dùng làm snapshot cutover |

Gom ngoại lệ theo ảnh hưởng để xử lý và báo go/no-go; không tự loại các khoản nợ/thu hoặc bỏ dữ liệu lịch sử để đạt deadline. Thu lịch sử không tạo cash/bank postings. Nếu chưa đạt các gate tài chính/UAT thì chỉ xác nhận môi trường online, không xác nhận cắt chuyển xong. Các deadline cần bám hiện trạng thực tế, không hứa ngày hoàn tất chỉ từ việc có repo/website.

## Thứ tự công việc tiếp theo

Owner chuẩn bị website/DB/volume và kết nối tài khoản trong khi Codex chốt build, đẩy code lên repo DGC và chuẩn bị kiểm từ xa. Sau đó schema/khởi tạo → nhập/đối chiếu staging → UAT → snapshot cuối/backup/restore → go/no-go → chuyển vận hành. Dừng mở rộng các đợt thử ngoại lệ nhỏ nếu chúng không giải quyết đường găng. Ba liên kết tài chính, SOA cutoff và roles còn mở phải được xử lý trong checklist này; timezone đã chốt, không hỏi lại.
