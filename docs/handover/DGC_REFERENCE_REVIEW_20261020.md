# Rà soát liên kết dữ liệu DGC — 20/10/2026

Đã bổ sung `scripts/dgc-migration/graph.mjs` và lệnh `review-references`, chỉ đọc snapshot đã kiểm checksum, không kết nối DB. Báo cáo chi tiết chứa dữ liệu nguồn được ghi trong `artifacts/` ignored; không đưa lên Git. Không nhập, sửa hoặc gộp financial record.

## Kết quả snapshot hiện có

Snapshot SHA-256 `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`, 25 bảng/3.154 hàng vật lý. Áp dụng các quyết định owner đã có theo đúng snapshot/row hash để so sánh alias; source cells giữ nguyên.

| Loại liên kết | Số lượng |
| --- | ---: |
| Mã duy nhất, không phát hiện mâu thuẫn ngữ cảnh | 10.806 |
| So sánh alias theo quyết định owner | 6 |
| Trùng mã, phân biệt được bằng ngữ cảnh | 19 |
| Thiếu hàng đích | 57 |
| Mã có đích nhưng mâu thuẫn ngữ cảnh | 4 |
| Trùng mã, chưa đủ bằng chứng phân biệt | 2 |
| Tổng | 10.894 |

Giữ nguyên 7 nhóm trùng ID và mọi hàng vật lý. Không còn lỗi đọc kỳ trong tập ngữ cảnh đã xét. Còn **63 liên kết chưa giải quyết**; con số này thuộc phạm vi mở rộng (revision, approval package, InputRecon, tài khoản…), không so trực tiếp với 40 diagnostics của raw preflight ban đầu.

Báo cáo private: `artifacts/dgc-migration/20261020/reference-review.json`, plan hash `c15a4604b128de6c7fb3707e488f1c5d436b3057a1b7e14417b240bb7c2e796f`. `postingAllowed=false`, `acceptance=false`: mã duy nhất hoặc ngữ cảnh khớp chưa chứng minh số tiền, quyền, phiên bản và trạng thái được chấp nhận để nhập.

## Nguyên tắc so sánh

- Mỗi hàng định danh bằng sheet ID, source row, legacy ID và row hash. Các link lưu toàn bộ ứng viên cùng chiều ngữ cảnh khớp/mâu thuẫn; báo cáo có digest xác định.
- Với nhiều ứng viên, chỉ chọn khi còn đúng một ứng viên không mâu thuẫn và có bằng chứng file nguồn/document, hoặc kỳ cùng partner/service/contract. Một ứng viên thiếu metadata vẫn có thể hợp lệ: không tự ưu tiên hàng đủ dữ liệu hơn.
- Drive file ID lấy từ ID/URL đã capture, không tải file hoặc truy cập nguồn. File ID khác nhau được giữ là mâu thuẫn, kể cả legacy upload ID duy nhất.
- Dịch vụ con nhận diện từ tên dòng PDF có trong danh mục. Nhãn hiển thị khác dùng Mapping_Service_ID có sẵn của donor; không tự đoán alias bằng cách bỏ dấu cách/gạch nối. Bundle header/upload có thể chứa nhiều dịch vụ con/hợp đồng.
- Invoice có thể chứa nhiều tháng doanh thu, không suy kỳ của từng dòng từ tháng header. Tháng approval package không mặc định bằng kỳ Invoice. Các quy tắc này tránh tạo cảnh báo giả, không cho phép thay đổi nguồn.
- Các bản superseded/cancelled vẫn nằm trong graph. Không chọn bản current bằng cách bỏ lịch sử; eligibility nhập cần bước kiểm riêng.

## Hàng cần đối chiếu tiếp

Chi tiết row/hash/file ID nằm trong báo cáo private. Các nhóm đáng chú ý:

- Hai Invoice detail/AR tham chiếu cùng revenue nhưng dịch vụ/document hoặc hợp đồng khác nhau.
- Hai PDF detail tham chiếu upload có file ID khác file trên header.
- Một Invoice revision trỏ bản kế tiếp không có trong snapshot.
- Một Invoice detail và một approval package còn tham chiếu trùng ID chưa phân biệt được.
- Các source document/detail/revenue/reconciliation thiếu, gồm các ID lịch sử còn lưu trong approval packages.

Chưa coi hàng vắng là đã bị xóa hợp lệ, chưa sửa ID và chưa tự đổi nguồn. Cần đối chiếu file/phiên bản và snapshot mới ở bước cutover. Tính đầy đủ của nhiều request capture chưa được bảo đảm như một giao dịch frozen.

## Chạy và kiểm chứng

```powershell
node scripts/dgc-migration.mjs review-references --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<reference-review.json>
```

`--decisions` tùy chọn; digest snapshot bắt buộc. Output bị giới hạn trong `artifacts/` của checkout. `pnpm test:migration` chạy core và graph fixtures: duplicate/context/file, ứng viên thiếu metadata, bundle/child, Invoice nhiều kỳ, danh sách ID, alias đã duyệt, ngày serial thiếu format, determinism và tamper/stale decision guards. Các fixture tổng hợp không chứa dữ liệu thật.

Việc tiếp theo: kiểm số tiền/trạng thái/revision và đối soát Invoice–payment–AR theo graph, đóng các ngoại lệ bằng bằng chứng, rồi mới thiết kế/import tài chính. SOA vẫn chờ quyết định khoản thu sau ngày chốt. Staging thực tế vẫn chỉ có master data; không post cash lịch sử.

Đã bổ sung [kết quả đối chiếu số tiền](DGC_FINANCE_REVIEW_20261020.md): 91 Invoice/53 AR cân bằng, nhưng vẫn có sai khác làm tròn, lỗi nguồn và lịch sử revision cần xử lý. Kết quả chưa cho phép posting.
