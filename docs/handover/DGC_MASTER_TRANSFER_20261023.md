# Chuyển danh mục DGC sang DB đích

Ngày 23/10/2026. Đây là đường vận hành riêng cho master data; không mở financial importer hoặc sửa giới hạn localhost của tools staging cũ.

## Gói và kiểm soát

- Exporter `scripts/dgc-master-transfer.mjs` gọi đúng mapper/decision validator hiện có. Core được chuyển nguyên hành vi sang `packages/db/prisma/dgc-master-core.mjs`; đường import cũ chỉ re-export. Không viết lại nghiệp vụ mapping.
- Gói chứa 10 services/4 partners/9 contracts/14 contract-service links và đúng 37 source rows. Không mang 3.154 hàng tài chính hoặc password/roles/session. Quyết định Movitel Active, sáu thuế 0.1 và hai alias vẫn bound original snapshot/row hash.
- Format `dgc-master-transfer-v1` có digest riêng, metadata giữ original snapshot hash, plan hash và decisions hash. Partial capture dùng transfer hash làm snapshot key riêng, không giả là full snapshot. Future financial adapter cần nhận biết provenance master-only này.
- Pin hiện hành `426f07990788b4aa2eded8c19cd53b911dd5e18a49af4f7404f8601d0a4c541c`; original snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; plan `c272f3fcf2b17d2b46a3af378f9776d0688dafda8b0f874c2416099e3e07f648`.
- Private upload: `artifacts/dgc-deploy/20261023/dgc-masters-runtime-preview.sql.bundle.json` (137.582 bytes). SQL sibling mặc định ROLLBACK; không upload SQL hoặc commit raw evidence vào Git. CLI từ chối overwrite và output thoát artifacts/junction.

## Runtime

- `/migration/masters` cho admin đã đăng nhập, dùng cùng session/CSRF; API preview/apply yêu cầu SYSTEM_CONFIG_EDIT, active ADMIN/DGC và same-origin. Mặc định tắt.
- Chỉ bật tạm `DGC_MASTER_TRANSFER_ENABLED=true`, pin `DGC_MASTER_TRANSFER_HASH` bằng digest nêu trên. Runtime chỉ nhận bundle khớp pin đã được exporter kiểm; không nhận SQL/code hoặc tự tin vào checksum client.
- Production DB phải có tên `dgc_erp_db`, đúng một tenant DGC/USD/Asia_Ho_Chi_Minh, operator đang active ADMIN. Test ngoại lệ chỉ NODE_ENV=test + localhost + DB synthetic riêng.
- Preview thực thi transaction Serializable rồi rollback; HMAC receipt bound user/company/hash, hạn 15 phút. Apply cần receipt và lý do, kiểm lại toàn bộ guards. Khởi nhập chỉ khi bốn bảng master trống; không adopt/ghi đè existing business keys.
- Một transaction lưu source rows, targets, dependency IDs, links và audit gắn operator thật. Replay kiểm metadata/source/target/hash/audit counts; drift hoặc downstream failure rollback toàn lượt. Không tạo Revenue/Invoice/AR/AP/payment/cash.
- Dùng `@erp/db/dgc-master-transfer` từ prisma folder nên flat single-site bundle mang code qua generator hiện có, không mang dữ liệu nguồn. Sau nhập phải tắt flag và redeploy.

## Bằng chứng hiện có

- API/UI build đạt; 32 suites migration và 66 unified web/API assertions đạt sau chuyển core.
- 25 PostgreSQL synthetic checks: quoting/DO delimiter, DB/tenant/operator, empty target, audit-failure rollback, replay, source/target drift, không financial posting.
- 119 kiểm trên source thật: counts 10/4/9/14, đọc đủ mọi mapped field/hash, preview rollback, replay không đổi, đủ owner decisions/audits, 0 financial rows; chỉ DB local disposable riêng. Report private `master-transfer-local-acceptance.json`.
- 24 HTTP/PostgreSQL checks: flag/pin, auth/ADMIN/CSRF/origin, từ chối SQL/modified bundle, preview rollback, signed receipt, commit/replay và drift.
- Host backup trước import: website thành công 729 KB, PostgreSQL thành công 292 KB ngày 23/10; chỉ Digicom-Erp. DB backup proof private `dgc-pre-master-db-backup.png`. Chưa restore thử từ backup này.
- Chưa ghi master từ xa tại thời điểm lập hồ sơ; cần triển khai runtime, cấu hình pin, chạy preview và kiểm UI đích trước apply. Tài chính lịch sử vẫn pending; snapshot cuối/delta trước cutover vẫn bắt buộc.
