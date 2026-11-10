# Dashboard kinh doanh và điều hành — 07/11/2026

Owner yêu cầu triển khai bố cục kết hợp đã chốt, với Tài khoản thay Trong đó quá hạn. UI/API v0.6.92 dựng DigicomDashboard riêng, GST tiếp tục dùng Dashboard cũ.

## Bố cục

- Bộ lọc năm, đến tháng, dịch vụ, tiền tệ báo cáo. Ban đầu chọn kỳ mới nhất có dữ liệu từ API, không chọn cứng tháng 10 hoặc bịa số cho tháng chưa nhập.
- Bốn chỉ số chính: doanh thu năm đến kỳ chọn, tăng trưởng cùng kỳ, còn phải thu, Tài khoản.
- Biểu đồ tháng hai năm, tự co theo màn hình; bảng đóng góp dịch vụ và tỷ trọng, 10 dòng/trang.
- Việc cần xử lý: doanh thu chờ Invoice, Invoice nháp hiện hành, Invoice còn dư đến hạn trong 7 ngày.
- Hàng phụ: doanh thu toàn lịch sử (USD/VND quy đổi của cùng doanh thu) và Phải trả. Tài khoản chưa thiết lập và Phải trả chưa cập nhật vẫn hiện, không biến thành số dư 0.
- Mở nhanh đúng tab Tạo Invoice / Invoice chưa phát hành / Công nợ phải thu hoặc phải trả / Thu chi chờ thiết lập. Không tạo, duyệt hoặc phát hành hồ sơ bằng việc bấm Dashboard.

## Ý nghĩa và phạm vi số liệu

Doanh thu dùng nguyên GET /dashboard/revenue và quy tắc TOTAL/CHILD/FX đã có: chỉ tính dòng tổng cho toàn dịch vụ, không cộng thêm dịch vụ con. Lọc một dịch vụ đọc riêng series của dịch vụ đó. Tiêu đề ghi thực nhận sau khấu trừ để đúng payable/net hiện hành; không đổi nghĩa thành gross hoặc dòng tiền đã thu. Tổng báo cáo và định dạng dùng BigInt đơn vị nhỏ nhất để tránh sai số khi cộng tiền; Number chỉ dùng tọa độ biểu đồ và tỷ lệ hiển thị, không ghi tài chính.

KPI năm đến kỳ chọn cộng các tháng <= kỳ chọn. Tăng trưởng chỉ so cùng các tháng có dữ liệu trong năm chọn, cần đủ dữ liệu năm trước và FX. Năm trước bằng 0 thì không đưa tỷ lệ phần trăm. Chưa có dữ liệu khác số 0; thiếu FX không dựng tổng, tỷ trọng hoặc cột bằng 0. Cột âm vẫn biểu diễn số âm đã lưu.

GET /dashboard/operations mới chỉ đọc, DGC-only, authenticate + ít nhất một quyền REVENUE_VIEW/INVOICE_VIEW/AR_VIEW. Mỗi phần được kiểm quyền riêng, thiếu quyền trả null và không query phần đó. Tenant/partner/service/contract/current/status được giới hạn, không trả raw actor/tài liệu hay chi tiết người dùng. Mọi query param không hỗ trợ đều bị từ chối.

- Chờ Invoice: dòng TOTAL được tính vào tháng, đã duyệt và hiện hành, chưa được InvoiceScopeItem/Scope hiện hành giữ chỗ. Nháp hiện hành hoặc scope chưa có Invoice vẫn giữ chỗ; scope/item cũ không giữ. USD/VND là tiền gốc tách biệt, không cộng chéo hoặc suy tỷ giá.
- Nháp: Invoice current DRAFT, issuedAt null, partner cùng tenant; không đếm bản lưu.
- AR: số dư sổ hiện tại của Invoice hiện hành đã phát hành còn dư, theo tiền gốc USD/VND; không lọc theo năm/dịch vụ báo cáo. Không mô tả là số dư lịch sử tại ngày chốt và không dùng ngày asOf tùy ý. Không đổi SOA THROUGH_AS_OF_INCLUSIVE.
- Đến hạn: dueDate từ hôm nay đến trước hôm nay+7, mốc ngày lấy Asia/Ho_Chi_Minh. Không gồm đã quá hạn, đã trả hết, hủy hoặc bản cũ. UI ghi rõ mốc xét hạn; không đặt ô Quá hạn trở lại.
- AP đọc GET /payables khi có AP_VIEW. Cash/catalog/expense/report không được gọi trên Dashboard, kể cả khi có PAYMENT_VIEW. Không mở cash deferral hoặc gán quyền.

## Kiểm tra

API/web build đạt. 33 kiểm tra helper cho tiền chính xác, lớn hơn safe integer, âm, zero baseline, thiếu tháng/FX và TOTAL/CHILD. 15 characterization Dashboard API và hồi quy comparison cũ đạt. 32 assertions trên DB localhost giả lập mới: giữ chỗ bởi nháp/scope không Invoice, scope/item cũ, USD/VND, biên hạn 0/+6/+7/-1, dữ liệu current/archived/tenant, quyền từng phần và fingerprint cả 63 bảng không đổi sau GET.

67 browser checks với phản hồi GET giả lập đạt: số thực trong bốn KPI, lọc/year/month/service/USD/VND, không trộn phạm vi AR/work, không cộng child, thiếu FX/lỗi không thành 0, không có dữ liệu, zero baseline, phân trang 12 dịch vụ thành 10+2, quyền riêng, deep-link đúng tab, cash không có request, mobile/desktop và GST giữ cũ. Đã xem ảnh desktop/mobile; dữ liệu trong ảnh hoàn toàn giả lập. Private artifacts/sidebar-layout-check/business-dashboard*. Không dùng thử hồ sơ tài chính thật.

## Triển khai

Không đổi schema/env/roles/importers hoặc dữ liệu/PDF. Source phát triển dgc/main, gói một website sinh bằng package-single-site.mjs trên codex/dgc-deploy. Owner triển khai lại rồi Ctrl+F5; chưa xác nhận host đã lên v0.6.92 hoặc nghiệm thu số liệu/nghiệp vụ thật. Bàn giao này thay trạng thái Dashboard chỉ là mockup trong các ghi chú cũ. Quỹ/ngân hàng tiếp tục chờ owner yêu cầu áp dụng.

## Xác nhận bản online — 10/11/2026

Kiểm GET công khai tại erp.digicomjsc.com xác nhận health release 0.6.92, DB connected; asset UI index-CTXvoaaV.js SHA256 46fc62a9269f07489fbd2aaab9cab52d45d726e2dc5b08b0afe0f1781716bebb khớp byte gói nguồn cb6eb71/deploy 98c1e4d. Trạng thái chờ triển khai ở trên đã được thay bằng xác nhận này. Không đọc dữ liệu tài chính/đăng nhập trong lượt kiểm; nghiệm thu báo cáo và nghiệp vụ của người dùng vẫn chưa được xác nhận. Xem roadmap rà soát 10/11.
