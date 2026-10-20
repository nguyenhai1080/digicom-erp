# Đối chiếu ngày chốt SOA — 20/10/2026

Đã thêm màn **Đối chiếu ngày chốt SOA** và API chỉ đọc để chuẩn bị quyết định cutoff còn chờ owner. Không mặc định chọn chính sách, không tạo số/PDF SOA, không ghi hồ sơ, tài chính hoặc cash.

## Căn cứ donor

Đã đọc v61 `52_StateOfAccount.js:353–452`, `40_Invoice_Core.js:1359–1378`, `50_ARAP.js:493–509`, `21_Recon_OCR.js:1538–1540`.

- Donor lọc Invoice theo ngày phát hành đến asOf, chỉ Invoice hiện hành đã phát hành và yêu cầu đúng một AR hiện hành.
- Donor cộng mọi Paid_Amount_USD theo Invoice_ID, không nhận ngày cutoff; payment được round2 trước khi trừ khỏi Total_Payable_USD. Vì vậy thu sau ngày chốt cũng làm giảm số dư tại ngày chốt.
- Fixture đặc trưng: Invoice 100 USD ngày 10/01, thu 60 USD ngày 05/02, asOf 31/01: số dư donor 40 USD, phương án chỉ thu đến ngày chốt 100 USD. API hiển thị cả hai, giữ quyết định AWAITING_OWNER.

## Runtime đã triển khai

GET `/api/v1/soa-cutoff-review/partners` trả các đối tác có Invoice hiện hành đã phát hành, chỉ company đang đăng nhập. GET `/api/v1/soa-cutoff-review?partnerId=<uuid>&asOf=YYYY-MM-DD&page=1` trả kết quả và tổng toàn bộ kết quả theo từng tiền tệ.

Phải có đồng thời AR_VIEW, INVOICE_VIEW, INVOICE_PAYMENT_VIEW và company DGC. Không thêm/gán quyền mới hoặc mở route này cho GST. Không trả bank account, chứng từ ngân hàng, ghi chú thu hoặc credentials.

Chỉ lấy Invoice hiện hành ISSUED/OVERDUE/PARTIALLY_PAID/PAID, invoiceDate <= asOf. Bao gồm bản trả đủ để thấy trường hợp ngày chốt làm thay đổi việc xuất hiện trong SOA; chưa áp bộ lọc includePaid theo một chính sách chưa được chọn. Draft/Cancelled/Superseded và bản sau ngày chốt không tham gia.

Mỗi dòng có số ban đầu, thu đến hết ngày chốt (bao gồm cùng ngày), thu sau ngày chốt và hai số dư. Dùng allocationAmount/allocationCurrency của receipt theo tiền tệ Invoice, không dùng cashAmount hay tỷ giá báo cáo. USD/VND tách tổng, không MZN hoặc quy đổi. Decimal HALF_UP hai chữ số; tổng là tổng các dòng đã hiển thị/làm tròn. Đây là bảng so sánh, chưa tuyên bố parity tổng donor trên dữ liệu lịch sử có độ chính xác khác hai chữ số. Không sửa tiền gốc hoặc dùng paidAmount hiện tại làm số dư lịch sử.

Đọc Invoice/AR/receipt trong một transaction RepeatableRead để các truy vấn cùng snapshot. Chặn thiếu AR, AR hủy/thay thế, tiền tệ receipt lệch hoặc tổng receipt/paid/AR lệch quá 0,01. Unique tenant/Invoice trong schema giới hạn một AR. Giới hạn 10.000 Invoice/100.000 receipt: vượt thì báo lỗi, không cắt dữ liệu rồi trả tổng thiếu.

Ngày chốt bắt buộc nhập rõ, kiểm ngày thực có trong lịch; không tự suy ngày hôm nay hoặc timezone công ty. Đây là date-only, chưa giải quyết câu hỏi timezone báo cáo đang chờ owner.

UI hiển thị partnerKey, legalName qua hover, phân trang 10 dòng với trước/sau và tổng/trang. Tổng riêng USD/VND giữ nguyên qua các trang. Đổi đối tác/ngày chốt bỏ kết quả cũ; lỗi không để bảng số liệu cũ hiện như kết quả mới.

## Kiểm chứng

- Build toàn workspace Node 22/pnpm 10 đạt.
- `test:soa-cutoff`: **56 assertions đạt** trên DB synthetic mới, gồm auth/quyền/tenant, ngày sai/missing/unknown field, hai chính sách, cùng ngày chốt, thu tương lai, PAID vẫn xuất hiện, loại draft/bản cũ/hủy, USD/VND, tổng qua trang, trang vượt/empty, AR không khớp/thiếu, receipt khác tiền tệ, làm tròn và không tăng số financial/document/audit/cash records khi đọc.
- Hồi quy role/manual/FX/receipt: **223 assertions đạt** trong DB UI mới.
- Browser kế toán giả lập: chọn SOA_SYN/ngày 31/01/2026, SOA-01 có 100 USD ban đầu, thu 20 USD đến ngày chốt và 40 USD sau đó → còn 80/40 USD. Trang 1 có 10 dòng; trang 2 có hai dòng, gồm VND 1.000.000/900.000. Tổng toàn kết quả USD 980/940, VND 1.000.000/900.000 giữ qua trang. Đã kiểm bố cục header sau sửa wrap chữ.
- Bằng chứng riêng Git ignored: `artifacts/dgc-ui/20261020/soa-cutoff-page1.png`. Fixture SOA tái dùng trong accounting-ui.fixture mode setup, không seed vào startup ứng dụng. Tab/server/mạng Docker riêng đã dọn sau kiểm; DB synthetic giữ lại để đối chiếu.

Chưa phát hành SOA/PDF hoặc đăng ký liên kết tài liệu, chưa có quy trình approve/package SOA. Cách chọn cutoff và includePaid cho SOA chính thức vẫn cần owner quyết định; ba mapping lịch sử/timezone vẫn chưa có xác nhận mới. Không nhập financial records thật, deploy, push hoặc provision người dùng thật.
