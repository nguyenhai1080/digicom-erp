# Kích hoạt website DGC riêng trên host

Ngày 23/10/2026, giờ Việt Nam. Tiếp theo [kế hoạch một website/cutover](DGC_SINGLE_SITE_CUTOVER_20261023.md). Website online và khởi tạo kỹ thuật không đồng nghĩa financial cutover đã hoàn tất.

## Môi trường đã xác minh qua phiên trình duyệt owner

- Đúng tài khoản **Công ty Cổ Phần Đầu Tư và Truyền Thông Số** tại v2.tinhgon.xyz. Connector MCP vẫn trả tài khoản GST; đăng nhập browser không đổi token MCP. Đã dùng browser UI có sẵn, không tạo/cấp thêm agent token hoặc dùng service GST.
- Website **Digicom-Erp**, ID `cmvkgp9h30auw0i5fuqpsqez2`, URL `https://digicom-erp.n1.tinhgon.xyz`, repo `nguyenhai1080/digicom-erp`, nhánh `codex/dgc-deploy`, một Node app, 0.3 core/512 MB. Không thay mức tài nguyên hoặc bật auto-deploy.
- PostgreSQL 16 **dgc-erp-db**, ID `cmvkh0sd20b1m0i5fvcjbk8q7`; tên DB owner báo `dgc_erp_db`, thuộc website này. Chỉ đọc trạng thái/quan hệ, không mở/reveal/copy password hoặc chuỗi kết nối. Host tự gắn DATABASE_URL/POSTGRES_URL; SESSION_SECRET đã được host tự sinh.
- APP_URL đã sửa từ domain chưa gắn sang URL HTTPS tạm nêu trên để đúng origin đăng nhập. Company code DGC, tên cấu hình owner nhập Digicom, USD, Asia/Ho_Chi_Minh, ERP_WEB_ROOT=/app/public, STORAGE_PROVIDER=local, STORAGE_ROOT=/app/storage.
- Host trước đó chưa khai persistent directory. Đã thêm `/app/storage` và áp dụng ở v3; đây là cấu hình host, chưa phải kiểm upload/redeploy/restore file nghiệp vụ từ xa sau login.

## Các phiên triển khai

- v1 build được release 653a6afd nhưng crash khi Prisma đọc DATABASE_URL, trước khi DB/cấu hình mới có hiệu lực. Không sửa schema hay bỏ kiểm tra để vượt lỗi này.
- v2 online: HTTPS/health thành công, `/api/v1/health` trả database connected, giao diện DGC ERP đăng nhập tải đúng.
- v3 online: áp dụng persistent directory `/app/storage`.
- v4 online: thêm UI `/setup` cho owner tự nhập quản trị đầu tiên; API bootstrap vẫn tắt. Chạy ERP_SEED_ON_START=true đúng một lượt để tạo công ty/quyền kỹ thuật/sequences. Runtime xác nhận **company DGC; 103 baseline permissions; 16 sequences; ADMIN role ADMIN**. Seed không tạo user, payment/cash, financial records hoặc gán Staff/Accountant/Manager/BOD.
- Sau seed đã lưu ERP_SEED_ON_START=false trở lại. Vibe Host xác nhận v5 **100%, trực tuyến**, áp dụng cấu hình false và release 4f4471d (source 20ee2a4; native form fallback POST). Browser control timeout ngay sau đó nên chưa kiểm lại health HTTP riêng của v5 hoặc đọc lại environment đang chạy; health connected được xác minh ở v2. Không để cờ seed true trong cấu hình cuối.

Không chạy financial importer từ xa. Các migration tools vẫn chỉ cho localhost dgc_migration_staging_*; không nới guard để kết nối production DB. Chưa chuyển domain erp.digicomjsc.com, tắt DGC cũ hoặc chốt số dư tiền.

Owner báo đã lưu token/flag bootstrap. Đã triển khai v6 qua browser đúng website; host xác nhận 100%, trực tuyến. HTTPS `/api/v1/health` sau v6 trả `status=ok`, `release=0.6.79`, `database=connected`. Không đọc/reveal token hoặc nhập credential. Form `/setup` đang trống và đã giữ tab để owner tự nhập/gửi; chưa tạo admin hoặc thử bootstrap. Proof private: `artifacts/dgc-deploy/20261023/dgc-v6-online.png`. Sau owner tạo xong cần tắt bootstrap và redeploy.

## Khởi tạo admin: bước owner cần tự nhập

UI mới tại `https://digicom-erp.n1.tinhgon.xyz/setup` chỉ gọi API bootstrap sẵn có, không tạo endpoint/quyền server mới. Có tên/email, password/confirm và setup token; xóa password/token khỏi form sau gửi, không ghi localStorage, dùng POST kể cả native fallback, không đưa secrets vào URL. Backend vẫn yêu cầu flag enabled + token >=32 ký tự và đóng vĩnh viễn khi công ty đã có user; guard đồng thời/role/origin không đổi.

Owner cần tự đặt token ngẫu nhiên riêng trong secret **AUTH_BOOTSTRAP_TOKEN**, bật **AUTH_BOOTSTRAP_ENABLED=true** và lưu ở host, rồi triển khai lại. Owner tự điền và gửi form `/setup`; không gửi password/token vào chat. Browser confirmation policy yêu cầu human handoff trước khi nhập credential mới; agent không nhập hoặc gửi password thay owner. Khi owner tạo xong, tắt AUTH_BOOTSTRAP_ENABLED và redeploy; kiểm đăng nhập/quyền thật trước UAT. Không hỏi lại timezone hoặc dùng credential donor.

UI build đạt, 66 unified web/API checks đạt; Docker bundle admin setup build trên Linux đạt và v4 phát hành từ xa thành công. Native POST refinement đã build UI, release v5 vẫn cùng server/dependencies/guard. Chưa claim owner-admin creation hoặc full role parity từ các kiểm này.

Private proof: `artifacts/dgc-deploy/20261023/dgc-online-login.png`, `dgc-seed-verified.png`, `admin-setup-build.log`; không lưu secret values. Owner có thêm tệp Word chưa tracked ở workspace; không đọc, sửa hoặc đưa chúng vào release.

Tiếp theo: owner admin → UAT/role/signing configuration, importer vận hành và đối chiếu tài chính staging → snapshot cuối/backup/restore → go/no-go/cutover. Worklist tài chính, SOA cutoff và ba liên kết chưa quyết định vẫn giữ riêng; không xem website online như hoàn tất di chuyển dữ liệu.
