# Chốt đối soát một dịch vụ có cả dòng chi tiết và dòng tổng — v0.6.98

## Nguyên nhân

Đọc phiên ERP đã đăng nhập, chỉ qua GET: hồ sơ MEUBEAT/RUP0006 kỳ 10/2026 còn OCR_EXTRACTED. PDF có dòng CRBT và tổng MEUBEAT_(CRBT); danh mục ánh xạ cả hai tới cùng một dịch vụ, hợp đồng và ContractService. Số tiền nguồn và USD của hai dòng bằng nhau. Luồng cũ ghi cả hai vào cùng phạm vi doanh thu nên vi phạm unique index, trả thông báo lỗi chung. Không chốt/đọc lại/xóa hay sửa hồ sơ thật trong lượt này; UUID và tiền thật không đưa vào Git.

## Thay đổi

- DGC lập kế hoạch ghi sổ tách khỏi bằng chứng tài chính. Giữ nguyên PDF, mọi dòng OCR, trường tiền và bindings gốc trong approvedSnapshot; thêm postingPlan vào digest/snapshot/audit.
- Chỉ một cặp CHILD/TOTAL cùng dịch vụ đầu trang, cùng hợp đồng/ContractService và bằng nhau chính xác theo Decimal ở mọi trường tiền nguồn, USD và chi phí mới dùng TOTAL làm dòng ghi sổ. CHILD giữ làm tham chiếu. Không suy alias bằng tên file và không tạo dịch vụ giả.
- Trùng dịch vụ nhưng lệch tiền, khác hợp đồng hoặc nhiều dòng không rõ nghĩa phải kiểm tra trước khi chốt; không tự cộng hoặc bỏ dòng.
- Nhóm nhiều dịch vụ có identity khác nhau giữ hành vi ghi chi tiết/tổng cũ. GST dùng toàn bộ bindings như trước. Không sửa parser, công thức, unique index, schema, quyền, env, importer hay cash.
- Màn kiểm tra giải thích vì sao chỉ ghi một doanh thu; vẫn giữ hai dòng nguồn và bắt buộc xem PDF/xác nhận trước khi chốt.

## Kiểm chứng

- API và web build đạt.
- 85 financial characterization và 20 posting-plan assertions đạt: nguồn bất biến, so từng trường tiền, lệch USD/hợp đồng/header/dòng trùng bị chặn, bundle nhiều dịch vụ không đổi.
- Linux Node22, CPU 0.3 / RAM512MB / heap192MB, DB giả lập mới: 132 API assertions đạt, gồm chốt alias tạo đúng một ReconciliationItem/Revenue, giữ source bytes/snapshot, sai quyền/digest bị chặn, lỗi audit hoàn tác cả DB và file, đổi vị trí ký không thêm doanh thu/cash.
- 7 browser checks giả lập đạt: hai dòng vẫn hiển thị, có giải thích, nút chốt/checkbox còn khóa trước preview; chỉ GET.
- Log và ảnh giả lập ở artifacts riêng. Không coi kiểm thử giả lập là nghiệp vụ đã chốt thật.

## Phát hành và thao tác owner

Đẩy nguồn dgc/main và gói một website codex/dgc-deploy. Owner triển khai lại nhánh codex/dgc-deploy. Sau đó đóng/mở lại màn Kiểm tra PDF RUP0006 để lấy digest mới, xem PDF và tự chốt. Không cần upload lại hoặc xóa hồ sơ. Chưa tuyên bố v0.6.98 online hoặc RUP0006 đã chốt; không phát hành Invoice thay owner.
