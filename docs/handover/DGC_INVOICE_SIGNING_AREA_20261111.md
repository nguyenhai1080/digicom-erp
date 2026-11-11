# Sửa chặn nhầm vị trí ảnh ký Invoice — v0.6.104

Owner báo tạo PDF có dấu bị chặn dù ảnh trông đúng vị trí. Không đọc được phiên IAB (không có tab); cửa sổ Chrome bị công cụ UI dừng vì không xác định được URL, không thực hiện thêm thao tác trên cửa sổ đó. Chưa khẳng định tọa độ thật trên host; sửa và chứng minh bằng code/fixtures, không thao tác Invoice thật.

## Nguyên nhân được xác định trong mã

1. Ngưỡng trên hiện hành là footerTop, tức sau cả dòng Thank you và khoảng chừa mặc định, thấp hơn đáy thực tế phần ngân hàng/thanh toán 39 pt. Vị trí dưới thanh toán nhưng trong khoảng trống này bị chặn chung với ảnh sai trang/tràn trang.
2. Canvas chuẩn hóa tọa độ kéo bằng border-box trong khi ảnh và percentage overlay dùng phần trong viền. Border ảnh overlay cũng làm bitmap nhìn nhỏ hơn vị trí PDF. Sai lệch này rõ hơn khi co khung xem trước.

## Sửa

- DGC tính vùng ký từ đáy thực tế của khối thanh toán đến giới hạn cuối trang trước chân trang, trả signingArea riêng theo Invoice/page/kích thước trang/tỷ lệ ảnh; default ảnh dưới lời cảm ơn giữ nguyên.
- Kiểm server dùng đúng đáy thanh toán, giữ bắt buộc trang cuối, mép phải/trái và giới hạn dưới. Tách lỗi rõ sai trang, đè thanh toán, tràn cuối trang hoặc ra lề; không bỏ validation. Dùng cùng sai số hình học nhỏ ở mép phải như hàm vẽ PDF, không áp dụng tolerance cho số tiền.
- Preview hiển thị nhẹ vùng ký, chuẩn hóa kéo theo phần trong viền và dùng outline thay border trên overlay DGC. Vị trí/kích thước được giới hạn bằng cùng vùng và tỷ lệ ảnh PDF: vị trí hợp lệ giữ nguyên; kéo/resize vượt vùng thì điều chỉnh trong vùng, không để gửi tọa độ sai. Khóa trang ký cuối theo server, vị trí vẫn riêng theo businessKey.
- rendererRevision DGC_MOVTV_COMPOSITE_V5_SIGNING_AREA buộc mở preview mới. signingArea là metadata xem trước, không nhận giới hạn do client tự khai trên endpoint lưu; PDF/create vẫn lập lại kế hoạch, kiểm digest và kiểm vị trí trên server.
- Không đổi font, form/tiền/nhóm dịch vụ, ảnh ghép được cấu hình, PDF đã lưu, role/env/schema/cash. GST renderer/API giữ nguyên; helper UI không có signingArea trả nguyên vị trí GST. Shared Canvas chỉ sửa cách lấy hộp tọa độ trong viền.

## Kiểm chứng

- API/web build đạt.
- 15 unit checks cho vị trí hợp lệ giữ nguyên, không áp dụng vùng DGC vào GST, riêng từng trang, kéo ở bốn góc/resize và tỷ lệ ảnh so với PDF.
- 53 browser checks: giữ các kiểm tra per-Invoice/cache/bundle/quyền/GST; thêm chỉ một vùng ký, tỷ lệ kéo đúng content-box, chặn kéo lên trên vùng của từng Invoice, resize/drag xuống dưới/phải vẫn tạo payload nằm trong vùng. API đều giả lập, không gọi host.
- PDF characterization có regression thực: ảnh nằm 0.5 pt dưới đáy thanh toán (trên ngưỡng mặc định cũ hơn 10 pt) tạo PDF thành công; ảnh cao hơn đáy thanh toán bị chặn. Layout-only và ký PDF vẫn thống nhất. Xuất/nhìn lại PDF gần đáy thanh toán ở artifacts/invoice-signing-area-20261111; không sửa PDF chuẩn hay ảnh gốc.
- Linux Node22/0.3 CPU/512MB/heap192MB, PostgreSQL16 tmpfs riêng: 246 API assertions đạt: thêm tạo PDF vị trí gần thanh toán hợp lệ, giữ chặn trên thanh toán/dưới trang/sai trang; các kiểm tra ảnh ghép chung, tiền/scope, digest, rollback, USD/VND và không cash tiếp tục giữ.

## Triển khai

Phát hành dgc/main và gói một website codex/dgc-deploy. Owner triển khai rồi tải lại trang và mở Xem trước Invoice mới để lấy signingArea/vị trí đúng; không dùng preview cũ. Kiểm PDF rồi owner tự lưu nháp. Không tự chốt hồ sơ thật hoặc ghi lại PDF lịch sử.
