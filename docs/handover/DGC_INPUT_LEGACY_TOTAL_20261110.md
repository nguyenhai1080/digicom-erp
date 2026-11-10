# Nhận diện nháp tổng cũ ngoài danh mục hiện hành — v0.6.97

## Nguyên nhân và kiểm tra thực tế

Owner gặp lỗi “Có dòng đối soát không còn thuộc phạm vi…” khi mở biên bản. v0.6.96 đã lấy đúng ba dịch vụ chi tiết, nhưng việc loại dòng tổng vẫn phụ thuộc dịch vụ tổng còn trong danh sách ContractService hiện hành và source ID còn current. Nháp tổng tạo trước khi cấu hình hợp đồng thay đổi bị coi là một dòng lạ, chặn cả biên bản.

Đã đọc phiên ERP owner đăng nhập trong trình duyệt tích hợp: hợp đồng MARVEL/kỳ 09/2026 có ba nháp con ISIGN, VOICEMAIL, MCA và nháp tổng IR-0001/MCAVM-ISIGN. Ba nguồn con đều có rowType CHILD, includeInMonthlyTotal=false và cùng parentServiceId trỏ đúng dịch vụ tổng; tổng có rowType TOTAL. Cả bốn còn Draft, chưa có AP. Chỉ đọc; không lưu/duyệt/refresh hồ sơ thật. Dữ liệu chi tiết/UUID/tiền không đưa vào Git.

## Sửa

- Nhận diện cả tổ tiên qua quan hệ đi vào các dịch vụ con trong hợp đồng và metadata parentServiceId của chính nguồn con; không bắt buộc dịch vụ tổng còn được liên kết Input hiện hành.
- Loại nháp tổng theo service identity đã được xác nhận, không phụ thuộc source ID của tổng còn current hay không. Kiểm cùng công ty/dịch vụ/kỳ/mạng trước khi coi một hồ sơ cũ là tổng tham chiếu. Không suy quan hệ bằng tên hay bằng tổng tiền.
- Danh sách đánh dấu **Dòng tổng — chỉ tham chiếu**, không đưa nút cập nhật, duyệt AP hoặc lập biên bản từ dòng đó. PDF cũ vẫn có thể tra cứu nếu đã lưu. Không sửa nháp tổng, snapshot, số tiền, trạng thái, timestamp hay file.
- Khi có AP ở tổng cũ cùng hợp đồng/kỳ/mạng, vẫn chặn tạo nghĩa vụ trùng; không tự sửa/hủy AP. Các dòng thật sự ngoài phạm vi vẫn bị chặn, nhưng lỗi nay nêu mã hồ sơ/dịch vụ/nguồn để xác định cụ thể.
- Giữ luồng chọn hợp đồng/kỳ của v0.6.96, đủ dịch vụ con, cách tính/làm tròn, captured print, role/env/schema/cash và GST. Không nhập lại lịch sử.

## Kiểm chứng và phát hành

API/web build đạt. 360 kiểm tra tích hợp Linux 0.3 CPU/512 MB/192 MB heap và 24 kiểm tra browser giả lập đạt. Bao gồm xóa liên kết tổng khỏi fixture hợp đồng sau khi đã có nháp, nguồn tổng superseded, preview/PDF/save chỉ có ba con, đánh dấu tham chiếu, chặn duyệt tổng, bảo toàn nguyên nháp cũ, conflict AP ngay cả khi nguồn tổng không current, nhận diện bằng metadata-only và relationship-only; giữ các kiểm tra captured/permission/rollback/replay/no cash.

Bản v0.6.97 đã kiểm thử trước khi owner dừng điều khiển trình duyệt bằng Escape. Owner tiếp tục và đăng nhập lại trong trình duyệt tích hợp; lần đọc xác nhận nêu trên không phát sinh thao tác tài chính. Tiếp tục commit/push source `dgc/main` và release một website `codex/dgc-deploy`; chờ owner triển khai và mở lại biên bản. Không coi lần đọc bản v0.6.96 là kiểm chứng runtime v0.6.97.
