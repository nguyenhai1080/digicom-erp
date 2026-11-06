# Diễn tập khôi phục sau chuyển — 06/11/2026

## Kết quả

Đã tải và khôi phục **DB cùng kho tài liệu thật sau chuyển** trên máy riêng, không khôi phục đè host. ERP Linux v24 khởi tạo được với DB phục hồi, health báo connected, phục vụ đúng UI và đọc được cả năm tài sản công ty đang hiệu lực. Không đăng nhập thay người dùng hoặc phát sinh chứng từ, công nợ, khoản thu hay cash. Host vẫn v24; lượt này không cần triển khai lại.

- DB: backup PostgreSQL ngày 06/11 lúc **08:39 giờ Việt Nam**, 2.387.292 bytes, `pg_restore --exit-on-error --no-owner --no-acl` thành công vào DB localhost mới `dgc_migration_staging_restore_20261106`.
- Website/kho: backup tự động ngày 06/11 lúc **03:00**, tải **không kèm .env**, 846.313.984 bytes. Manifest xác nhận đúng Digicom-Erp, source release v23 `f2dc25b5723c79e05e705647406b1b2fb21abdc9`; hash hai phần source/appdata khớp. Chỉ giải nén storage vào thư mục mới, không thực thi source hay phục hồi biến môi trường.
- Khôi phục 912 tệp/884.687.725 bytes trong storage; **460/460 Attachment** được đọc lại và khớp kích thước/SHA256 trong DB (445.189.691 bytes). Toàn bộ 458 Document nối đúng công ty/Attachment, kể cả các phiên bản ảnh đã thay thế và hồ sơ cũ. 451 PDF chuyển sổ vẫn được giữ.
- 63 bảng/28 migrations phục hồi; ràng buộc DB đã validate. Có 417 revenues, 66 native Invoices (gồm tám October đã lưu), 53 AR, 51 receipts, ba Generated InputRecon, AP/cash/SOA mới đều 0. Giữ 37 archive nguồn và bản lưu October 8 Invoice/8 revenue/5 recon/18 PDF; tháng 10 hiện hành vẫn trống.
- 37 liên kết danh mục và mọi provenance đọc được. 3.207 trường Decimal tài chính khớp chính xác gói chuyển đã ghim; không tính lại tiền. Tám AR mở giữ 25.328,54 USD. Bốn người dùng ACTIVE/mẫu quyền được bảo toàn; không đọc mật khẩu hoặc impersonate.
- Kiểm DB chạy trong transaction chỉ đọc; fingerprint cả 63 bảng trước/sau giữ nguyên. Runtime Linux 512 MB/0,3 CPU/heap 192 MB chạy với DB read-only và storage mount read-only: 20 checks đạt, năm ảnh hiệu lực truy xuất được, các đường tài chính thiếu đăng nhập trả 401. Bộ nhập/seed/bootstrap/cash đều false trong bản chạy thử.

## Cảnh báo metadata nguồn — giữ riêng, không sửa sổ

Kiểm hash payload phát hiện **26/89 hàng appendix** có số serial thời gian trong JSON khác nguồn ghim ở chữ số cuối, sai khác tối đa `7.275957614183426e-12` ngày (khoảng 0,63 microsecond). Các đường dẫn khác chỉ thuộc `Created_At`, `Approved_At`, `Uploaded_At`, `Upload_Date`, `Imported_At` và metadata ô tương ứng. Đây là khác biệt của bản DB đã sao lưu; không do lượt restore tạo ra. Cách ghi appendix qua Prisma JSON trước đây là nguyên nhân nghi ngờ; chưa chạy thử tái tạo để khẳng định nguyên nhân.

3.254 payload còn lại khớp hash, bao gồm toàn bộ snapshot 3.154 hàng trước appendix và 37 hàng danh mục. Không có khác biệt tiền trong native financial fields hoặc tệp. Không sửa payload/rowHash, đổi ngày, làm lại importer hay cập nhật host để che cảnh báo. Bản appendix gốc đủ 89 hàng và gói chuyển gốc được kiểm pin, sao chép riêng vào gói phục hồi private, cùng DB nguyên trạng và báo cáo sai khác. Đây là kiểm toàn vẹn truyền/khôi phục, không mở lại thẩm định tính hợp lệ nghiệp vụ cũ.

Vì vậy kết luận là **khôi phục DB/kho và đọc runtime thành công, kèm cảnh báo metadata nguồn**, không phải “mọi hash nguồn đều sạch”. Verifier xuất `allSourcePayloadHashesVerified=false`, danh sách 26 hàng và **exit 2**; không đổi kiểm tra thành success sạch. Không dùng 15.987 assertions kỹ thuật làm nghiệm thu người dùng.

## Bản ghim và bằng chứng private

DB SHA256: `6820d92699ad839cd82fb095c48f38e5ffaaa1a1c6893a52a5f4635662001e19`.

Website SHA256: `dd5e698774e8f6b09f2bc06d80167930e21ea80506e1629ef996d5b26f1616fa`.

Thư mục `artifacts/dgc-migration/20261106/restore/`: hai archive gốc; `storage-0300/manifest.json`, `proof.json`, `storage-inventory.json`; DB/storage đã khôi phục; `book-proof-final.json`, `book-verify-final.log`, `book-verify-exit.txt`, `runtime-proof.json`; `original-appendix.json`, `original-captured-book.json` và `appendix-differences-private.json`. Không đưa bất kỳ tệp này vào Git/release.

Hai backup chụp khác giờ và website manifest cũng ghi rõ không nguyên tử. Lần này toàn bộ 460 liên kết file trong DB mới hơn đều khớp kho đã tải; kết quả chỉ áp dụng cho cặp bản đã kiểm. Bản sao nóng hoặc các backup khác giờ sau này phải kiểm lại liên kết file, không mặc định nhất quán. Đây chưa phải diễn tập khôi phục lên hạ tầng thay thế từ xa hoặc kiểm lại toàn bộ nghiệp vụ của nhân viên.

## Công cụ tiếp tục

Đọc [hướng dẫn khôi phục](../DGC_BACKUP_RECOVERY_GUIDE.md). Mười test bảo vệ giải nén và ba test chặn DB thật/remote đạt. Verifier baseline 06/11 chỉ đọc, không có nhánh sửa dữ liệu. Giữ nguồn hash mismatches và gói gốc ở trạng thái cảnh báo; không dùng cảnh báo này để trì hoãn thao tác tháng 10 owner đang tự làm, tự nhập lại dữ liệu hoặc bắt owner duyệt số liệu cũ.
