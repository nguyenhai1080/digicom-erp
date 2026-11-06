# Đã lấy tỷ giá GST vào DGC — 06/11/2026

Owner đồng ý phương án đã nghiên cứu bằng “ok” và yêu cầu làm tiếp. Đã thực hiện **96 lượt tạo tỷ giá còn thiếu** qua biểu mẫu FX chuẩn của DGC, bằng phiên quản trị hiện hữu; không dùng tài khoản giả lập trên host, không lấy approver ID GST hoặc mở importer lịch sử.

## Kết quả thật

- Đọc lại GST và DGC lúc tiếp tục khoảng 13:29 giờ Việt Nam, sinh lại gói: nguồn vẫn 97 kỳ, đích vẫn một kỳ 01/2026; 96 additions và rate/source hash khớp chính xác phương án owner đã xem.
- Backup PostgreSQL **trước nhập lúc 13:29 đã Thành công**, khoảng 2,4 MB, tải được private. Không ghi đè backup cũ hoặc DB thật.
- Hoàn thành lúc **13:36**, DGC GET trả **97 kỳ**, gồm 96 kỳ mới 09/2018–09/2026 (trừ 01/2026) và kỳ DGC đã có. Từng rate/source mới đọc lại từ server khớp kế hoạch, không có kỳ dư.
- Bản ghi **01/2026 giữ nguyên toàn bộ JSON**, gồm rate/source/sourceKind/capturedRowJson; không thay theo tỷ giá khác của GST. Không tạo 10/2026 vì nguồn GST chưa có, không lấy tháng 9 thay thế.
- Nguồn mỗi kỳ ghi ERP GST, domain, kỳ và nguyên văn nguồn. GET GST sau thao tác khớp toàn bộ response trước, không ghi GST. Sinh lại plan trên kết quả thật trả **0 additions / 96 same / một conflict giữ DGC**; không thử ghi replay trên host.
- Dashboard đã hiển thị VND doanh thu lũy kế **18.930.676.822**. USD doanh thu **757.389,25** và phải thu **25.328,54 USD** giữ như trước; đủ bốn card, Phải trả/Tài khoản vẫn Chưa cập nhật.

Tỷ giá dùng cho báo cáo và các đối soát đầu vào VND **mới**. Không sửa/chốt lại ba InputRecon captured, không tạo Invoice/SOA/khoản thu/AP/cash, không nhập tháng 10 thay owner. Không đổi mã, schema, quyền, secrets, tài nguyên host hoặc chạy redeploy.

## Cách áp dụng và phạm vi kiểm

Host không có nút nhập file FX tùy chọn trong UI hiện tại. Vì vậy dùng **96 lần Lưu tỷ giá mới**, mỗi lần kiểm đúng kỳ/rate/source trên biểu mẫu, xác nhận và chờ biên nhận thành công. Đây không phải một transaction chung 96 kỳ như bài thử API batch. Đã đọc lại bảng từ server theo nhóm và toàn bộ cuối lượt.

Một lượt chờ browser bị gián đoạn khi đang điền kỳ tiếp theo. Đã đọc lại server, xác nhận 74 kỳ đã lưu đúng rồi chỉ tạo 22 kỳ còn thiếu; không bấm lặp để đoán trạng thái. Tiến trình private và kết quả cuối đều giữ lại. Không promote DB trial hoặc đăng nhập thay người thật.

**Backup sau nhập lúc 13:36 còn Đang chờ / 0 B trên Vibe Host tại lần kiểm cuối.** Nút tải/restore của bản này bị khóa, nên chưa tải được để so fingerprint hai DB thật trước/sau. Không ghi là backup sau đã thành công hoặc mọi bảng DB thật đã được so hash. Backup trước đã tải và restore vào localhost riêng; script so hai dump mới chỉ chuẩn bị, chưa chạy vì thiếu dump sau. Khi tiếp tục, kiểm đúng bản đang chờ rồi tải/đối chiếu nếu đã xong; không nhập lại FX hoặc tạo thêm backup chỉ để né trạng thái chờ.

## Bằng chứng

Private `artifacts/dgc-migration/20261106/gst-fx/live/1330/`: capture GST/DGC trước; `import-plan.json/.csv`; `ui-progress.json`, các checkpoint/resume server; `dgc-after.json`, `gst-after.json`, `live-proof.json`; `rates-2026.png/.txt`, `dashboard-final.png/.txt`; `backup-before.txt`, `db-before.dump`, `backup-after.txt`. Không đưa dữ liệu rates/raw/actor IDs/dump vào Git/release.

[Nghiên cứu và 309 checks bản sao](DGC_GST_FX_RESEARCH_20261106.md) vẫn là bằng chứng thử, không phải kết quả DB hash thật. Bàn giao này thay thế trạng thái “chưa nhập FX host” của ghi chú trước. Tháng 10 tiếp tục chờ kế toán nhập tỷ giá có căn cứ và owner tự thử nghiệp vụ.
