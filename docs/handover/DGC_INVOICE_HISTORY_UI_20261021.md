# Kiểm UI Invoice lịch sử — 21/10/2026

Tiếp tục [runtime reader](DGC_INVOICE_HISTORY_RUNTIME_20261021.md). Dùng giao diện build thật, API/auth thật, DB synthetic riêng và archive giả có 12 bản lưu. Không nối kho tài chính thật vào web server.

## Đã kiểm trực tiếp

- Kế toán giả lập mở Invoice lịch sử được; danh sách 12 bản, 10 dòng trang 1 và 2 dòng trang 2. Source status Superseded/Cancelled và ngày formatted hiển thị đúng.
- Tìm chính xác SYN-DUPLICATE trả hai hàng nguồn riêng HIST0/HIST1, không gộp theo số pháp lý. Bản đầu giữ -90.0000, bản sau 90.0000.
- Mở HIST0: header giữ raw date serial và tiền gốc; 12 dòng chi tiết chia 10/2, giữ số âm, có tổng/trang và khóa nút trước/sau đúng. Pointer MISSING vẫn hiển thị chưa có hàng đích.
- Đã quan sát bố cục hai bảng và các nút tại viewport mặc định của browser. Không có thao tác sửa/phát hành/ghi thu.

## Lỗi đã tái hiện và sửa

Khi một lần tìm bị lỗi kho, bấm tìm cùng số lần nữa không làm useEffect chạy vì filter/page không đổi. Dù kho đã phục hồi, màn hình vẫn giữ thông báo lỗi đến khi đổi điều kiện hoặc rời trang.

Thêm loadVersion tăng sau mỗi submit để mỗi lần bấm tìm là một request mới, bỏ lỗi/dữ liệu cũ theo luồng load hiện có. Không đổi API, quyền, schema hoặc nội dung archive.

Đã kiểm trước/sau bằng cách tạm giữ COMPLETE.json của **archive giả trong container riêng** rồi khôi phục. Trước sửa: cùng query vẫn giữ lỗi. Sau sửa: cùng query SYN-DUPLICATE tải lại được hai bản ngay, không cần đổi số hoặc tải lại cả trang. Marker fixture đã được phục hồi.

## PDF

Link Mở PDF gốc và URL trực tiếp đã thử trong browser nhúng; không quan sát được nội dung trang PDF, chỉ nền trống, console không có lỗi được ghi nhận. Không coi đây là pass cho trình xem PDF inline, cũng chưa kết luận nguyên nhân thuộc ứng dụng hay browser nhúng.

Bổ sung link **Tải PDF gốc** cùng endpoint được phân quyền/hash guard, để lấy file độc lập với trình xem inline. Đã bấm tải qua browser và nhận `historical-invoice.pdf`, **902 byte**. SHA-256 của file tải về khớp hash PDF trong archive fixture đang mount. Không tái sinh, chèn dấu hoặc thay bytes file.

PDF fixture này là dữ liệu giả, không chứng minh chữ ký hoặc bố cục các Invoice lịch sử thật. Kiểm API bytes của gói 33 bản thật đã ghi riêng trong handover runtime.

## Bằng chứng và kiểm chứng

- Web build Node 22/pnpm 10 đạt sau sửa retry và thêm tải PDF. Không đổi API nên không chạy lại suite API chỉ để tăng số kiểm tra; 63 assertions trước đó vẫn là bằng chứng riêng.
- Private Git ignored: `artifacts/dgc-ui/20261021/history-ui-detail.png`, `history-ui-proof.json`. Screenshot cho thấy hai số Invoice trùng, tiền âm và trang 2 của dòng chi tiết.
- Chưa kiểm trình xem PDF inline trên Chrome/Edge thông thường hoặc responsive/mobile. Một lần kiểm phụ bộ lọc quá hạn bị browser gián đoạn trở lại, xem handover bộ lọc; không ghi nhận thành công cho phần chưa quan sát.
- Không deploy/push, gán quyền người dùng thật hoặc thay financial records. Server/mạng Docker riêng được dọn sau kiểm; DB synthetic giữ lại.
