# Pháp nhân và form đối soát đầu vào trong nước — v0.6.111

Owner gửi lại PDF mẫu MCA/VOICEMAIL/ISIGN kỳ10/2026 và yêu cầu đúng tên Việt, form/font; hai công ty tự ký số. Tài liệu tham khảo giữ riêng trong máy, không đưa vào Git hoặc gói triển khai.

## Kết quả đối chiếu

Mẫu là Letter ngang 792×612pt, Times New Roman Regular/Bold/BoldItalic; nội dung11.04pt, tiêu đề12.96pt. Form native hiện có đã theo các mốc/lề/bảng8 cột gộp, thứ tự tiêu đề bộ ba MCA/VOICEMAIL/ISIGN, dòng tổng, bằng chữ và hai đại diện. Đã render và xem lại mẫu mới: đủ ba dòng một trang, không tràn, vùng ký trống.

Renderer tiếp tục nhúng Liberation Serif 2.1.5 Regular/Bold/BoldItalic (font mở tương thích Times, không tuyên bố là Times New Roman thật hoặc trích font từ PDF). Không đổi số liệu/công thức/làm tròn để chạy theo số tiền mẫu. Không sao chép chữ ký số, ảnh dấu, metadata ký hoặc trường ký của PDF mẫu.

## Sửa lỗi tên pháp nhân

Native InputRecon trước đây lấy issuerName từ profile Invoice quốc tế nên có thể in Digicom JSC. Theo yêu cầu owner, từ bản này lấy tên đã xác nhận trong mẫu: **Công ty Cổ Phần Đầu Tư và Truyền Thông Số**. Renderer thêm (DIGICOM) ở đoạn Bên A và dùng tên Việt đầy đủ tại đại diện Bên A. Không cập nhật profile Invoice, company record hoặc đối tác trên host; Invoice quốc tế và captured printing giữ nguyên.

Revision DGC_DOMESTIC_INPUT_V2 tham gia digest native và biên nhận lưu PDF để yêu cầu preview mới khi bản trình bày thay đổi. PDF cũ bất biến, không tự sửa/ghi đè, không tự tạo phiên bản trên host. Nhóm ba dịch vụ vẫn một biên bản, không cộng thêm dòng tổng tham chiếu.

## Kiểm tra

- API/web build đạt.
- 419 InputRecon/AP assertions trên PostgreSQL giả lập Windows đạt, gồm issuer tiếng Việt qua statement-preview trong khi profile khác; captured, tiền, AP, scope, replay/rollback và cash regression đạt.
- PDF characterization native/captured: một trang/đa trang, Unicode, từ chối tràn, payload bất biến đạt.
- Kiểm PDF mẫu tạo lại: Letter ngang một trang, nhúng serif, tên Việt, không ảnh hoặc trường ký; PNG đã xem trực quan.

## Nhận bản mới

Owner triển khai nhánh codex/dgc-deploy. Mở lại biên bản hợp đồng, tạo PDF xem trước mới rồi tự kiểm tra và lưu phiên bản khi phù hợp. Hai bên dùng công cụ ký số của mình với tệp đã kiểm. Lưu PDF không tự duyệt AP hoặc chi tiền. Chưa có thao tác hay nghiệm thu tài chính thật trên host trong lượt này.
