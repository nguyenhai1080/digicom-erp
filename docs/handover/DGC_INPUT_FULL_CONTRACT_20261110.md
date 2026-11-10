# Biên bản phải đủ dịch vụ của hợp đồng — v0.6.95

Owner xác nhận hợp đồng ba dịch vụ con phải lập chung một biên bản, không rời từng dịch vụ. Quyết định này thay hành vi v0.6.93–94 cho phép chọn một tập con để tạo nháp rồi in các dòng đang có.

## Luồng mới

- Bấm **Lập đủ dịch vụ hợp đồng** ở bất kỳ nguồn nào: batch preview tự lấy toàn bộ nguồn của dịch vụ có ContractService Active/đúng kỳ, cùng hợp đồng Input/kỳ/đối tác đầu ra. Không phụ thuộc đánh dấu đủ dòng hay trang danh sách. Xem trước hiển thị toàn nhóm, tổng tiền và bản đã có.
- UI dùng toàn bộ source IDs từ preview để tạo. Backend batch-generate cũng kiểm đủ phạm vi, không tin lựa chọn từ client; endpoint generate đơn lẻ bị chặn khi hợp đồng/kỳ cần nhiều nguồn. Chỉ tạo các nháp thiếu, giữ nguyên snapshot/status/file/số tiền và timestamp bản đã có.
- Lập biên bản preview/PDF/save kiểm đủ mọi dịch vụ và nguồn trước khi tính dữ liệu in. `includeApproved=false` không phải lối xuất một phần. Thiếu doanh thu đầu ra đã chốt phải báo mã dịch vụ; không tạo dòng 0 hoặc tự chia nguồn gộp thành số liệu con.
- Dòng ngoài tập dịch vụ/nguồn hiện tại cũng bị chặn, tránh cộng trùng dòng gộp cũ và các dòng con. Không tự xóa/hủy/sửa hồ sơ cũ để vượt kiểm tra.
- Dòng sổ theo từng dịch vụ vẫn giữ chi tiết; **Biên bản hợp đồng** luôn gộp cả nhóm. Duyệt AP vẫn riêng theo quyền hiện có, không tự duyệt khi tạo nháp/PDF. Cash, schema, role, env, tiền/công thức và GST không đổi.
- Captured print giữ hành vi bất biến riêng; không ép sửa số liệu đã chuyển để đủ hợp đồng đang cấu hình. File PDF cũ vẫn giữ nguyên, chỉ áp dụng kiểm đủ khi lập biên bản mới.

## Kiểm chứng

API/web build đạt. 312 API assertions Linux 0.3 CPU/512 MB/192 MB heap, bao gồm chọn một nguồn mở đủ ba, chặn direct partial generate và partial batch, thiếu nguồn con, chặn preview/PDF/save một phần, bổ sung hai nháp thiếu mà không sửa bản cũ, chặn dòng ngoài phạm vi và giữ toàn bộ captured/permission/rollback/replay/AP/cash checks. 23 browser assertions giả lập đạt; một dòng cũng dùng batch contract preview và gửi đủ IDs khi lưu. Không chạy nghiệp vụ thật trên host.

Chờ owner triển khai v0.6.95 từ `codex/dgc-deploy`. Sau triển khai, chọn kỳ/hợp đồng, bấm **Lập đủ dịch vụ hợp đồng** ở một dòng, kiểm đủ các dịch vụ rồi **Tạo nháp đủ hợp đồng**. Sang danh sách đã tạo mở **Biên bản hợp đồng** và lập PDF mới. Không cần nhập lại/xóa các nháp đã có; bản trùng được giữ nguyên khi hoàn thiện nhóm.
