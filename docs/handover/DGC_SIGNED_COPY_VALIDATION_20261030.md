# Kiểm chứng bản sao Recon trong gói ký — 30/10/2026

Profile `SIGNED_PACKAGE_COPIES_V1` chỉ áp dụng Invoice nguồn hàng 44 / INV0050, gói APP0048. Năm bản sao giữ đầu trang 07/2026 và chân trang 06/2026 theo quyết định owner; năm file Recon gốc vẫn thiếu. Không gọi đây là khôi phục file gốc, chấp nhận native identity hoặc tỷ giá vận hành.

Review nguồn đạt 24 assertions, Invoice proposal đạt 19 trên cả Windows và Linux. Năm nhóm/tám revenue giữ nguyên toàn bộ giá trị nguồn và sự khác biệt native; child USD không in trên PDF không được ghi là printed USD. Review hash `f10db7e91eea51a9a4d4f2b4488114c0bf86ad61ccff56c0baa108d34dfb1e5c`, Invoice plan `ea60cad4fa51eb7330efbc5abac34e64612842538d35aa822f7e8e4bd0900d1d`.

Byte guard riêng đạt năm assertions: kiểm file, đổi một byte PNG trong bản sao tạm nhưng giữ root/pin/size, yêu cầu bị từ chối, phục hồi bytes rồi kiểm lại thành công. Không sửa chứng từ gốc và không cache kết quả filesystem.

Lượt PostgreSQL đầu bị giới hạn transaction 120 giây và rollback; chưa tính là đạt. Đã gộp các yêu cầu kiểm child PDF có đúng cùng tám trường đầu vào trong một bước, không lưu kết quả đọc file giữa các bước/lượt. Unit 14 assertions kiểm từng trường khác biệt và input mutation; PostgreSQL guard cũ 69 assertions đạt lại. Giữ nguyên giới hạn 120 giây, dựng lại đầy đủ plan trước transaction, kiểm bytes/text/renders và fingerprint bên trong.

Lượt thử chung 44 Invoice tiếp theo bị ngắt khi Docker mất kết nối lúc 00:14 ngày 30/10 (`unexpected EOF`, exit 125); không tính là pass. Phải kiểm lại footprint clone sau khi Docker phục hồi trước lượt thử tiếp. Mốc hoàn tất được chứng minh vẫn là [43 Invoice / 862 assertions](DGC_USD_REFERENCE_UNIFIED_20261029.md); toàn bộ 45 migration suites đã chạy xong exit 0. Không có financial commit hoặc thay đổi host từ công việc này. Không mở importer cũ, promote trial rows hoặc tự duyệt các dòng nguồn Draft. Invoice 14/33 và các hồ sơ còn held tiếp tục theo quyết định owner; full history, importer vận hành, UAT, frozen snapshot/backup và cutover chưa hoàn tất.

Proof riêng nằm trong `artifacts/dgc-migration/20261029/signed-package-copies/`, log PostgreSQL tại `artifacts/dgc-migration/20261024/child-rounding/signed-package-copies-source.integration.log`; không đưa dữ liệu private vào Git/release.

Lượt tiếp theo giữ container `dgc-signed-copy-trial-20261030` thay vì tự xóa khi mất kết nối. Sau khi chờ PostgreSQL ready và sửa harness để nhận đúng symlink reader đã có, lượt hiện tại đã dựng lại được tập 44 và xác nhận hash tập 43 không đổi, đang kiểm injected failure/replay/rollback. Đọc `retained-trial.log` trong thư mục proof nêu trên và trạng thái/exit code container; phải có exit 0 cùng proof đầy đủ trước khi tăng mốc hoàn tất. Không khởi chạy thêm trial ghi DB đồng thời. Các lần khởi động trước báo DB starting-up và symlink EEXIST đều không tính đạt.
