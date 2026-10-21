# Đối chiếu số tiền lịch sử DGC — 20/10/2026

Đã bổ sung lệnh `review-finance`, chỉ đọc snapshot/hash và reference graph. Không ghi DB, không đổi số tiền, không chạy hàm sync/repair donor, không quy đổi MZN hay post cash lịch sử. `postingAllowed=false`, `acceptance=false` cho toàn báo cáo.

## Kết quả trên snapshot 19/10

Snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`, reference plan `c15a4604b128de6c7fb3707e488f1c5d436b3057a1b7e14417b240bb7c2e796f`. Báo cáo private `artifacts/dgc-migration/20261020/finance-review.json`, digest `e4f8496edaf1e5c57435f113fa6813f4a0b092b3d2b847030cb14e5ecfc5df16`.

Tổng **2.124 phép so sánh**, gồm 2.001 MATCH và 123 MISMATCH. MATCH chỉ có nghĩa hai giá trị đã so sánh bằng nhau; không chứng minh bản ghi đủ điều kiện nhập hoặc chuỗi nguồn hợp lệ. Graph vẫn có 63 liên kết chưa giải quyết.

| Kiểm tra | Kết quả |
| --- | --- |
| Tổng Paid_Amount_USD từ các payment của từng Invoice so với header | 91/91 khớp |
| Outstanding = Total_Payable_USD − tổng payment | 91/91 khớp |
| Đúng một AR hiện hành cho Invoice cần AR | 53/53 khớp |
| AR Original so với Invoice payable | 53/53 khớp |
| AR Paid so với tổng payment | 53/53 khớp |
| AR Outstanding so với Invoice outstanding | 53/53 khớp |

Không tính khoản thu theo cutoff trong báo cáo này: cộng mọi payment được capture, theo logic tổng donor. Kết quả này không quyết định câu hỏi SOA ngày chốt đang chờ owner.

## Các sai khác được giữ lại

| Phép so sánh khác nhau | Số phép | Độ lệch tuyệt đối lớn nhất |
| --- | ---: | ---: |
| Header payable so với revenue − WHT | 30 | 0,03 USD |
| Tổng detail so với header (revenue/WHT/payable) | 3 | 0,01 USD |
| Detail payable so với revenue − WHT | 81 | 0,01 USD |
| Detail so với doanh thu nguồn (3 trường) | 9 | Có một dòng lịch sử chênh lệch lớn |

Ba sai khác header/detail đều trong tolerance issue 0,02 USD của donor `40_Invoice_Core.js:DGC_assertInvoiceIntegrityBeforeIssueV81170_`. Báo cáo vẫn ghi chênh lệch chính xác, không đổi chúng thành MATCH hoặc tự sửa. Chênh lệch revenue − WHT có thể liên quan việc từng thành phần được làm tròn độc lập; đây là giả thuyết cần đối chiếu PDF/cách tính nguồn, chưa phải kết luận nguyên nhân.

Trong 9 phép so sánh detail–revenue khác nhau, 6 phép lệch 0,01 USD. Ba phép còn lại thuộc cùng một Invoice detail lịch sử có số âm, trên Invoice **Superseded**; không xem nó là chứng từ hiện hành hoặc ghi đè bằng doanh thu hiện tại. Báo cáo ghi ba NEGATIVE_AMOUNT tương ứng ba trường và giữ provenance. Cần thiết kế đường nhập lịch sử/revision phù hợp thay vì nới guard tạo Invoice mới.

Hai Invoice detail không đủ bằng chứng chọn revenue nguồn được ghi UNRESOLVED_REVENUE_SOURCE. Không so sánh tiền với một hàng chọn tùy ý, không thay bằng số 0.

## Phạm vi và căn cứ

- Donor `40_Invoice_Core.js`: lưu detail/header từ các số Invoice_*_USD, cộng từng trường độc lập; integrity guard issue tolerance 0,02. Hàm update payment status dùng max(0, payable − paid); audit dùng đẳng thức chính xác để không che overpayment.
- Donor `51_Payment_Transaction.js:DGC_paymentSummaryByInvoiceV180_`: cộng mọi payment cùng Invoice_ID; không lọc theo ngày/Status. Không gọi các hàm sync có side effect transaction/cash.
- Chỉ kiểm các cột USD đã có của Invoice/detail/payment/AR; currency Invoice khác USD ghi unsupported, không tự đổi. USD/VND runtime vẫn giữ phạm vi đã xác nhận. Số VND nhận thực tế không dùng suy ngược số USD và không post tài khoản.
- Dùng Decimal precision 120, giữ giá trị capture, không rounding khi so sánh; ô trống/giá trị sai cú pháp là UNAVAILABLE và có issue. Số âm được giữ và đánh dấu. Giới hạn 80 chữ số đầu vào nhằm tránh phép cộng âm thầm mất precision.
- AR hiện hành theo Is_Current và status, chỉ loại ARAP_Type=AR. AP và InputRecon lịch sử nằm ngoài lệnh này; đã bổ sung [report riêng ngày 21/10](DGC_INPUT_FINANCE_MIGRATION_20261021.md): ba Generated/0 AP, một sai khác 0,5 VND được giữ với PDF nguồn, chưa nhập tài chính.
- Invoice có thể chứa nhiều kỳ, bản superseded/cancelled vẫn có phép kiểm riêng. Không dùng việc Paid/balance khớp để bỏ qua sai nguồn, revision hoặc file thiếu. Không kiểm ngày đến hạn, phân bổ cash hay báo cáo theo timezone chưa xác nhận.

## Chạy và kiểm chứng

```powershell
node scripts/dgc-migration.mjs review-finance --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<finance-review.json>
```

Output private trong `artifacts/`; digest bắt buộc trước chạy. `pnpm test:migration` gồm core, reference graph và financial fixtures: cộng Decimal 10,1 + 19,9, nguồn dòng, không lọc ngày thu, AR active, chênh lệch trong donor tolerance vẫn hiển thị, missing/invalid/negative amount, overpayment không clamp, invoice/AR mồ côi và MZN không quy đổi. Không chạy DB và không dùng dữ liệu thật làm fixture.

Tiếp theo: đường nhập revision/negative historical row và chứng từ immutable, đối chiếu file để đóng lỗi nguồn, mapping quyền, SOA sau quyết định cutoff và rehearsal financial import trên staging riêng. Chưa nhập financial record thật hoặc triển khai.

Đã bổ sung [gói lịch sử Invoice và bản sao PDF](DGC_INVOICE_HISTORY_20261020.md): 91 PDF gốc đã lưu riêng/kiểm checksum; phát hiện trùng số giữa hai phạm vi Invoice và chuẩn bị ba ánh xạ theo PDF đang chờ owner. Gói chưa cho phép posting.
