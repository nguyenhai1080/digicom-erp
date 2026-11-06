# Digicom dùng kiểu chữ và menu GST — 06/11/2026

Owner chọn font và bố trí menu của GST thay phương án Segoe UI v0.6.87. Đã đọc CSS công khai đang chạy tại erp.gsttech.vn (không đăng nhập, không ghi GST), lưu riêng artifacts/gst-style-reference-20261106/gst-0.css để đối chiếu.

UI v0.6.88 bỏ khối override Segoe UI/heading/KPI của v0.6.87, trở về Arial/Helvetica/sans-serif và hệ phân cấp chữ gốc giống GST. Sidebar theo CSS GST đang chạy: padding 16px/10px, mô tả 12px, nav padding 8px/9px, line-height 1.3, radius 8px, cao tối thiểu 34px, footer padding 10px; giữ thanh cuộn ẩn. Màn desktop thấp <=600px thu khoảng cách để đủ mục. Tên Digicom, tab nghiệp vụ và phân quyền không đổi. Nhãn KPI dạng chữ vẫn nhỏ/nhẹ hơn số để tránh placeholder chiếm ưu thế; không thay nội dung hoặc phép tính.

Điện thoại dùng nút Mở menu/Đóng menu, aria-expanded/aria-controls và nav dọc cuộn dự phòng như GST. Chọn mục tự đóng menu. Tab có kích thước chạm tối thiểu 44px. Không đưa menu Thu chi/cash hay dữ liệu/chức năng GST sang Digicom.

Build TypeScript/Vite và 87 browser checks GET giả lập đạt. So sánh computed style của Digicom với fixture dùng CSS GST thật: family, cỡ chữ/gia trọng/padding/radius nav, h1, padding sidebar và cỡ mô tả khớp. Hồi quy branding/login/tab/quyền, menu đủ tại năm kích thước, mở/đóng mobile và GST giữ nguyên đạt; đã xem ảnh Dashboard. Chứng cứ private artifacts/sidebar-layout-check/gst-matched*. Không đổi API/schema/env/data/assets/PDF hoặc host GST/DGC. Gói codex/dgc-deploy chờ owner triển khai, UI v0.6.88.
