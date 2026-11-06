# Đối soát đầu vào đã chuyển — 06/11/2026

## Thay đổi

Ba hồ sơ Generated lịch sử chưa có PDF nhưng giao diện cũ ghi “Đã tạo PDF” và cho phép cập nhật bằng công thức hiện tại. Đường lập biên bản cũng yêu cầu tính lại từ doanh thu/hợp đồng/tỷ giá hiện hành, không phù hợp yêu cầu giữ nguyên sổ đã chuyển.

- Hồ sơ captured có nhãn riêng, xem số liệu chỉ đọc và bị chặn refresh ở API. Hồ sơ mới tiếp tục dùng luồng hiện hành.
- “In số liệu đã chuyển” đọc đúng các trường tiền/tỷ lệ/tỷ giá đã lưu; không chạy lại generator, không làm tròn lại tiền VND lịch sử. Bản in ghi rõ là bản tra cứu mới, không phải PDF nguồn và không có dấu/chữ ký.
- Xem trước không ghi DB. Lưu bản in chỉ liên kết PDF mới, giữ tiền, trạng thái, snapshot/digest và hồ sơ gốc. Không tự duyệt hoặc tạo AP. Duyệt vẫn là thao tác riêng có quyền và xác nhận.
- Kiểm snapshot, provenance và công ty trước khi in; digest kiểm lại trước lưu, lỗi ghi hoàn tác cả file/DB. Không thay schema hoặc mở bộ nhập.

## Kiểm tra trước phát hành

Windows: 233 assertions tích hợp InputRecon/AP (gồm hồi quy luồng mới), hai bài characterization PDF đạt. Có thử thiếu quyền/CSRF/provenance, đổi tiền, nguồn doanh thu đã hủy, thiếu FX hiện hành, rollback khi audit lỗi, replay và duyệt riêng đúng tiền gốc/không cash.

Giao diện thử trên DB giả lập riêng: xem chỉ đọc; tạo/lưu bản in phiên bản 2; trạng thái Approved và AP giữ nguyên. Fixture có tiền khác kết quả tính lại (39,99 USD; nội tệ 999.751,23; thuế 123,45; payable 999.627,78 VND), chứng minh bản in đọc giá trị đã lưu. Đã xem bố cục PDF một trang và 35 dòng/ba trang. Đây không phải dữ liệu thật hoặc UAT người dùng.

Linux 512 MB / heap 192 MB / 0,3 CPU: cùng 233 assertions đạt trên ảnh phát hành `dgc-erp-input-captured:20261106`; 28 migrations cũ áp dụng trên DB thử trống, không có migration mới. Hồ sơ private: `artifacts/dgc-migration/20261106/input-recon/`; log Windows `artifacts/input-recon-captured-v3-test.log`, Linux `linux/test.log`.

## Đã triển khai và kiểm host

- Source `fb80616bdde5a07e5309e0512fe04b3dbd150c9d`, release `eb063c5788083056efbff6530e5fbc3226c0a44d`, một ứng dụng/145 files, không có dữ liệu hoặc tài sản nguồn trong release.
- Digicom-Erp **v24 online 06/11/2026**. Backup PostgreSQL trước triển khai thành công lúc 08:39 (2,4 MB). Không đổi biến môi trường hoặc tài nguyên.
- Bundle UI tải từ tên miền chính thức khớp SHA256 bản Linux tested; health 200/DB connected. Phiên quản trị còn dùng được sau reload.
- Đọc lại cả ba hồ sơ thấy đúng nhãn Đã chuyển (Generated), nút xem chỉ đọc và in riêng, không còn cập nhật nguồn. Các số phải trả 5.846.925 / 21.879.638 / 74.820.375 VND không đổi.
- Preview ba hồ sơ cùng kỳ/hợp đồng và PDF xem trước thành công; tổng 102.546.938 VND, giữ các trường đã lưu. Đã xem ảnh render PDF, không dấu/chữ ký, không chồng chữ. Không bấm lưu bản in hoặc duyệt trên host.
- AP sau kiểm vẫn 0 bản ghi. Ba hồ sơ vẫn Generated, không có PDF liên kết mới. Dashboard giữ đủ bốn card, AR đọc 25.328,54 USD.

Bằng chứng private: `host-v24-online.png`, `host-public-proof.json`, `host-preview.txt/.png`, `host-captured-preview.pdf`, `host-pdf-preview.png`, `ap-after.txt`, `host-after.txt/.png`. Đây là kiểm triển khai/đọc dữ liệu, chưa thay thế UAT của nhân viên.

## Phạm vi host

Đọc trước sửa: INP0017/INP0018/INP0019 kỳ 01/2026 còn Generated, không có PDF; AP trống. Không duyệt, tính lại, lưu bản in hoặc thay tiền các hồ sơ thật trong kiểm triển khai. Tháng 10/2026 tiếp tục do owner tự nhập; cash và mọi importer vẫn đóng.
