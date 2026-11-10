# Mẫu PDF đối soát đầu vào theo file owner — v0.6.94

Owner phản hồi mẫu v0.6.93 chưa giống form gửi, yêu cầu dựng lại theo PDF đính kèm. Đã đọc thông số/text và xem render của PDF gốc: Letter ngang 792×612 pt, serif thường/đậm/đậm nghiêng, bảng 8 cột không STT với hai nhóm tiêu đề gộp, dòng ký hiệu cột, tiền/tỷ giá phân tách nghìn, tổng đậm, bằng chữ đậm nghiêng và hai đại diện ở cuối.

## Thay đổi

- Dựng lại renderer native theo khổ/lề/tọa độ cột và bố cục file mẫu; bỏ cấu trúc 9 cột và đoạn hướng dẫn làm tròn không có trong mẫu cũ. Bảng lặp tiêu đề khi nhiều trang, tăng chiều cao khi tên mạng/đối tác dài; từ chối nội dung vượt giới hạn thay vì cắt tiền.
- Dùng Liberation Serif 2.1.5 tương thích Times, nhúng Regular/Bold/BoldItalic, kèm giấy phép và nguồn phát hành. Không lấy font/chữ ký số hoặc raster nguyên trang từ tài liệu owner để đưa vào Git.
- Tiêu đề/đoạn hợp tác, ngày dd/mm/yyyy, nhóm tỷ lệ và số hưởng hai bên, dòng tổng, phần bằng chữ và đại diện theo form. Với đúng bộ ba MCA/VOICEMAIL/ISIGN, thứ tự tên trên tiêu đề theo mẫu; không đổi thứ tự hay chia lại số liệu dòng. Dịch vụ gộp đang có một dòng trên sổ vẫn là một dòng, không tự bịa phân bổ ba dịch vụ.
- Danh xưng pháp nhân vẫn lấy từ cấu hình Invoice/đối tác; quốc gia mạng lấy countryName khi có, không đoán địa chỉ/quốc gia từ tên Movitel. Tên ngắn đang cấu hình không được âm thầm thay bằng pháp nhân hardcode từ PDF tham khảo.
- FX giữ đầy đủ phần thập phân, chỉ phân tách nghìn phần nguyên. Nếu hợp đồng có khấu trừ, vẫn ghi rõ khoản đã trừ để không làm sai nghĩa số phải trả.
- Dòng ký hiệu cột `5=3-4` được giữ nguyên như mẫu owner yêu cầu, chỉ là nhãn trình bày từ form, không phải công thức thực thi. Công thức tính tiền donor, số tiền đầu vào, nguồn/snapshot, AP, schema, quyền, env và cash đều giữ nguyên.
- Chỉ native InputRecon dùng form này. Bản in CAPTURED vẫn riêng và bất biến. Không nhập số liệu tham khảo, duyệt AP hay phát hành/ký chứng từ thật.

## Kiểm chứng

- API/web build đạt; PDF characterization kiểm Letter đúng 792×612, ba dịch vụ một trang, nhiều trang/Unicode/overflow và payload không bị sửa. Captured PDF regression đạt.
- Linux 0.3 CPU/512 MB/192 MB heap: 288 kiểm tra InputRecon/AP đạt với font mới, nguồn/money/captured giữ nguyên, không phát sinh cash.
- 33 kiểm tra PDF riêng đối chiếu khổ, baseline tiêu đề, mép cột, nhãn, số hiển thị và không sao chép chữ ký; PNG bản so mẫu và bản nhiều trang đã xem. Bằng chứng/số liệu tham khảo chỉ tại `artifacts/input-form-20261110/`, không đưa vào repo/release.
- Chưa có nghiệm thu trên host thật. Gói v0.6.94 chờ owner triển khai lại trên cùng nhánh `codex/dgc-deploy`.

## Cách nhận mẫu mới

Sau triển khai, vào **Đối soát đầu vào → Đối soát đã tạo → Biên bản → Tạo PDF xem trước**. Nếu đúng, xác nhận **Lưu biên bản PDF** để lưu phiên bản mới. Liên kết PDF của phiên bản đã lưu trước vẫn mang mẫu cũ cho tới khi chủ động lập bản mới; không sửa/ghi đè file lịch sử. Lập bản PDF mới không thay tiền hoặc tự duyệt AP.
