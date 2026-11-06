# Sao lưu và phục hồi DGC ERP

Mã nguồn trên GitHub không chứa DB hoặc PDF. Phục hồi cần đủ bản PostgreSQL, bản website có `/app/storage`, phiên bản mã phù hợp và cấu hình bí mật do owner quản lý. [Diễn tập 06/11/2026](handover/DGC_BACKUP_RESTORE_20261106.md) đã kiểm DB/kho/runtime trên môi trường riêng, kèm cảnh báo metadata nguồn được ghi rõ.

## Khi đang vận hành

Trên Vibe Host, chọn đúng **Digicom-Erp → Sao lưu**. Lịch hiện có: PostgreSQL hằng ngày 02:00, giữ năm bản tự động; website/kho hằng tuần 03:00, giữ ba bản. Lịch này chỉ được đọc lại, không thay đổi trong diễn tập. Backup thủ công trước thay đổi quan trọng vẫn giữ riêng.

Kiểm bản sao thực sự ghi **Thành công**. Một bản DB không chứa PDF; một bản website không thay thế PostgreSQL backup. Khi có chứng từ mới, cần bản kho đủ mới tương ứng. Các phần backup có thời điểm chụp riêng, nên phải kiểm đủ mọi tệp DB tham chiếu trước khi coi một cặp backup dùng được.

Khi tải website để thử, bỏ chọn **Kèm tệp .env**. Cấu hình bí mật giữ trong kênh riêng, không đưa vào chat, Git hoặc báo cáo. DB dump và kho tài liệu cũng là dữ liệu private. Không gửi kèm khi bàn giao mã nguồn.

## Diễn tập trên môi trường riêng

1. Tải đúng hai backup của DGC, ghi thời điểm và SHA256, giữ bản gốc không chỉnh sửa trong private `artifacts`. Không bấm **Khôi phục** trên host để thử.
2. Tạo PostgreSQL DB trống trên localhost tên `dgc_migration_staging_restore_YYYYMMDD`. Dùng `pg_restore --exit-on-error --no-owner --no-acl` vào DB mới, không dùng clean/drop hoặc tái sử dụng DB thật.
3. Dùng `scripts/dgc-restore-storage.py --archive <private archive> --out <NEW private folder> --sha256 <download hash>`. Công cụ kiểm tenant/manifest/checksum, chặn đường dẫn thoát, symlink, tệp .env và ghi đè; không thực thi source. Kho thực tế có thể nằm dưới thư mục con `storage/vays-appdata`, dùng đúng thư mục đó làm STORAGE_ROOT.
4. Với đúng baseline 06/11, chạy `scripts/dgc-verify-restored-book.mjs --storage <restored root> --appendix <pinned original appendix> --book <pinned original book> --out <NEW private report>`, DATABASE_URL trỏ DB localhost ở bước 2. Công cụ tự đặt transaction chỉ đọc; đọc counts, provenance, metadata hashes, tiền đã lưu, lịch sử October và hash từng file. Exit 0 là sạch theo baseline; exit 2 là đã xuất báo cáo nhưng còn source-payload warning; lỗi khác dừng kiểm. Dữ liệu phát sinh sau baseline cần một bộ kỳ vọng mới, không xóa chứng từ để khớp số cũ.
5. Chạy bản ERP phù hợp trong môi trường cách ly, DB read-only và storage read-only, không nối DB/storage thật hoặc nạp .env host. Giữ importer/master/evidence/bootstrap/seed/cash tắt. Kiểm health, UI và tài sản công ty; không đăng nhập thay nhân viên hoặc phát hành chứng từ để thử.
6. Lưu biên bản, hash, giới hạn và các cảnh báo. Không lấy việc restore thành công làm xác nhận toàn bộ UAT hoặc xoá bản gốc/backup host.

## Nếu cần khôi phục hệ thống thật

Owner cần xác định sự cố, thời điểm muốn phục hồi và các chứng từ phát sinh sau mốc đó trước khi thay hệ thống thật. Chuẩn bị/kiểm bản phục hồi trên môi trường riêng và sao lưu trạng thái hiện tại trước; xác định cách xử lý phát sinh mới để tránh mất hoặc nhập trùng. Việc đổi traffic hoặc ghi đè DB thật là một thao tác riêng, không được thực hiện tự động bởi các công cụ diễn tập trên.

Quỹ/ngân hàng chưa áp dụng; không thêm tài khoản hoặc số dư trong quá trình phục hồi. Không mở lại bộ nhập lịch sử để thay thế restore.
