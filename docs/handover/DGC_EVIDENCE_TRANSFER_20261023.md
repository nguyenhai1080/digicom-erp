# Chuyển kho nguồn DGC — 23/10/2026

## Phạm vi và trạng thái

Đã chuẩn bị runtime chuyển nguyên snapshot nguồn vào kho evidence của DB DGC riêng. Đây là raw evidence để đối chiếu; không tạo revenue, Invoice/AR, receipts, tài khoản tiền, phê duyệt hoặc bút toán. Chưa apply trên host tại thời điểm ghi tài liệu này; host vẫn v12 và tài chính chưa nhập/cutover.

Gói private: `artifacts/dgc-migration/20261023/evidence-transfer/evidence.bundle.json`; tuyệt đối không đưa vào Git/release. Bundle hash `1bbdd0b77aa72a210010c2407e5c68ac5859f7e4783521523c85696eb4722895`, snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`: 25 bảng / 3.154 hàng. 37 master provenance hiện có phải khớp hoàn toàn, không ghi lại master.

## Runtime và bảo vệ

- `/migration/evidence`: quản trị DGC có SYSTEM_CONFIG_EDIT và ADMIN active; bảng nguồn/Invoice đều phân trang 10, tìm Invoice hoặc partner key.
- POST preview/apply riêng, CSRF/origin, pin `DGC_EVIDENCE_BUNDLE_HASH`, flag `DGC_EVIDENCE_TRANSFER_ENABLED=false` mặc định, body 16 MiB, preview HMAC gắn actor/company/hash, hết hạn 15 phút. Production chỉ DB `dgc_erp_db`; không mở lại master importer hoặc các staging guard localhost.
- Preview ghi thử và rollback; apply serializable/khóa company, ghi nguyên payload bằng JSON text để bảo toàn date serial 17 chữ số; kiểm toàn bộ hàng sau ghi, 22 model nghiệp vụ không đổi. Audit gắn snapshot/row manifest/91 Invoice row hashes; replay không trùng và từ chối snapshot có sẵn thiếu biên nhận.
- GET status/Invoice nguồn vẫn đọc khi tắt flag sau chuyển, giữ pin. Chỉ trả trường Invoice allowlist, không raw cells/actor/bank. Kiểm payload hash với row pin trong audit; sửa raw + tự rehash vẫn bị chặn.
- Không gán quyền/tài khoản thật. Không đưa donor records/secrets vào release một website.

## Kiểm tra đã đạt

- 17 unit assertions; toàn bộ 36 migration suites đạt.
- 49 PostgreSQL assertions với nguồn thật trên clone master: 3.154 hàng/25 bảng, 37 links; ghi/đọc/replay/rollback sạch, 0 financial records.
- 63 HTTP PostgreSQL assertions trên DB synthetic: quyền, CSRF/origin/pin, rollback khi audit lỗi, apply/replay, phân trang 21 Invoice (10/10/1), tìm kiếm, tamper, đọc sau khi tắt importer.
- 48 host-finance regression assertions sau tách shared master resolver; giữ nguyên guard staging.
- API/web build đạt. Browser local kiểm trang 2, trang 3 một hàng và tìm EVIDENCE/21 được một kết quả; ảnh private `ui-search.png`.
- Kiểm riêng verify gói thật trong Docker Node 22, giới hạn 512 MiB / 0,3 CPU: 6,314 giây, max RSS 184 MiB. Đây chưa phải đo toàn HTTP/DB trên host.

Bước tiếp: build/test/publish release từ source đã commit; triển khai đúng Digicom-Erp, backup DB trước apply, preview rồi lưu gói nguồn qua phiên admin owner, kiểm 91 Invoice và tắt flag/redeploy. Sau đó tiếp tục operational financial transfer, files/registry và UAT. Kho nguồn đầy đủ không đồng nghĩa hoàn tất migration tài chính.
