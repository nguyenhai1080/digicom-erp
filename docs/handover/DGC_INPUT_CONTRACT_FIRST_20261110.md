# Hợp đồng trước, chi tiết sau; không cộng cha và con — v0.6.96

Owner chỉ ra bản v0.6.95 vẫn in cả MCAVM-ISIGN và ba dịch vụ con. Nguyên nhân: kiểm đủ ContractService nhưng chưa phân biệt cấp tổng/chi tiết khi cả bốn cùng nằm trong hợp đồng. Bản này thay quy tắc v0.6.95 ở việc xác định phạm vi dòng được tính.

## Xác định đúng phạm vi

- Dựa trên quan hệ dịch vụ tổng hợp có hiệu lực (`INCLUDED`, `AGGREGATED`, `BUNDLED`) và/hoặc metadata nguồn `rowType=CHILD`, `includeInMonthlyTotal=false`, `parentServiceId`. Native output writer đã lưu metadata này khi chốt đối soát. Không dùng tên chứa dấu gạch, tên gần giống hoặc tổng số tiền bằng nhau để suy quan hệ.
- Khi có quan hệ tổng–con, chỉ lấy các dịch vụ chi tiết cuối cùng của hợp đồng/kỳ/mạng. Dịch vụ tổng được loại trước kiểm tiền tệ/FX và trước cộng tiền; phần preview ghi rõ mã dòng tổng đã loại. Quan hệ vòng lặp, thiếu liên kết dịch vụ con hoặc thiếu nguồn được chốt đều báo lỗi, không tự phân bổ tiền hay tạo dòng 0.
- Nháp dòng tổng đã tạo trước được giữ nguyên snapshot, trạng thái, số tiền, tệp và thời điểm. Không đưa nháp này vào preview/PDF mới và không cho duyệt thêm AP của nó khi dùng dịch vụ con. Nếu tổng đã có AP, chặn nghiệp vụ và báo xung đột để xử lý riêng, không tự hủy/điều chỉnh công nợ thật.
- Nguồn chưa tạo đánh dấu dòng tổng chỉ để tham chiếu. Hồ sơ captured và các PDF đã lưu vẫn giữ nguyên; không áp dụng tính lại lịch sử. Cách làm tròn từng dòng VND giữ nguyên nên tổng các dòng chi tiết có thể khác cách làm tròn một dòng tổng; không tự cân bằng hoặc thêm khoản điều chỉnh.

## Thao tác theo hợp đồng

1. Chọn kỳ, hợp đồng và ngày biên bản; nếu có nhiều mạng thì chọn mạng đầu ra.
2. Bấm **Lập biên bản theo hợp đồng**. Không có checkbox chọn từng dịch vụ, không có nút tạo từng nguồn. Nguồn chi tiết nằm trong phần tra cứu thu gọn.
3. Preview lấy đủ dịch vụ chi tiết, giữ bản đã có và chỉ bổ sung nháp thiếu. **Lưu nháp và mở biên bản** chuyển thẳng sang preview biên bản, không cần tìm từng dòng để bấm tiếp.
4. Nếu đã đủ nháp, **Mở biên bản hợp đồng** đi thẳng sang biên bản mà không gọi tạo nháp lần nữa. Kiểm PDF rồi lưu phiên bản mới theo luồng hiện có.

Endpoint mới `POST /api/v1/input-recon/contract-preview` dùng `INPUT_RECON_GENERATE`, tenant DGC, Origin/CSRF, hợp đồng/kỳ và outputPartnerId tùy chọn. Không tự chọn mạng nếu có nhiều mạng. Metadata mạng trong danh mục được đọc trong tenant; statement selection hỗ trợ cùng mạng để không gộp sai đối tác đầu ra. Không có thay role/env/schema, không sửa GST, không nhập lại lịch sử/cash hay thao tác sổ thật.

## Kiểm chứng

- API/web build đạt.
- 336 assertions tích hợp Linux 0.3 CPU/512 MB/192 MB heap: dữ liệu gồm tổng và ba con cùng hợp đồng, nháp tổng cũ nguyên vẹn, chỉ ba dòng/tổng tiền con đi vào PDF, metadata-only và quan hệ cấu hình, thiếu một con không dùng tổng thay thế, chặn AP tổng và chặn xung đột AP đã có; các kiểm tra quyền/tenant/rollback/replay/captured/no cash tiếp tục đạt.
- 20 browser assertions giả lập: không chọn dịch vụ con, chọn hợp đồng trực tiếp, scope ba dòng, chuyển thẳng sang biên bản sau lưu, mở lại bản đã đủ không tạo nháp, view-only và nguồn thiếu. Đã xem ảnh desktop của preview và biên bản.
- Bằng chứng riêng trong `artifacts/input-contract-first-20261110/` và `artifacts/sidebar-layout-check/input-contract-first.mjs`; không đưa dữ liệu source/PDF thật vào Git.

Chờ owner triển khai v0.6.96 trên `codex/dgc-deploy`, rồi lập PDF phiên bản mới. Không tuyên bố PDF hoặc sổ thật đã được sửa từ kiểm thử giả lập.
