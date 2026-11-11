# Font Invoice nhúng trong PDF — v0.6.100

Owner phản hồi v0.6.99 chưa đúng font. PDF chuẩn MOVTV dùng ArialMT/Arial-BoldMT; v0.6.99 dùng StandardFonts Helvetica/HelveticaBold, không nhúng hai font này. Đã đổi DGC sang Liberation Sans Regular/Bold 2.1.5 nhúng subset trong mỗi PDF. Đây là font tương thích kích thước Arial, không gọi là chính font Arial. Cả chữ đậm/thường hỗ trợ tiếng Việt, không còn phụ thuộc font Helvetica thay thế của trình đọc PDF.

Nguồn chính thức: https://github.com/liberationfonts/liberation-fonts ; archive 2.1.5 và SIL OFL cùng nguồn với Liberation Serif đã có trong repo. Thêm hai font nguyên bản và ghi checksum trong apps/api/assets/fonts/Liberation-README.md; không lấy font subset từ PDF mẫu hoặc đưa Arial Windows vào Git. GST renderer giữ nguyên.

Đổi resource rendererRevision sang DGC_MOVTV_202609_V3 để các preview cũ phải tải lại; không sửa tiền, công thức, mã, profile, ảnh ký, sổ hoặc PDF đã lưu. Bố cục MOVTV v0.6.99 giữ nguyên.

Kiểm thử: API/web build đạt. Invoice characterization kiểm rõ BaseFont Regular/Bold Liberation Sans, FontFile2 được nhúng, không có Helvetica; USD/VND, 8 dịch vụ + dấu vuông vẫn một trang, 45 dòng chia trang không mất nội dung. PyMuPDF đọc lại cả ba PDF xác nhận bytes font nhúng và text nằm trong khổ trang; fontkit kiểm các glyph tiếng Việt thường/đậm. Đã render và nhìn lại bản tám dịch vụ. Bằng chứng private artifacts/invoice-font-20261111. Linux Node22/CPU0.3/RAM512MB/heap192MB chạy cùng characterization đạt. Không coi là nghiệm thu thật.

Phát hành dgc/main và một website codex/dgc-deploy, owner triển khai rồi Xem trước Invoice lại. File PDF lịch sử không tự đổi; không tạo/lưu/phát hành Invoice thật trong lượt này.
