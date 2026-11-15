# Hồ sơ chứng từ Digicom

Vào **Quản lý đối soát → Hồ sơ chứng từ** hoặc **Quản lý Invoice → Hồ sơ chứng từ**. Chọn Đầu vào/Đầu ra, đối tác, kỳ và hợp đồng; mở PDF để kiểm tra. Bật **Hiện phiên bản cũ** để tra cứu bản đã thay thế.

## Cấu trúc hồ sơ

```text
Năm/Kỳ/Đối tác/Hợp đồng/
  01-DoiSoatDauRa/
    Goc/                 PDF nguyên trạng từ đối tác
    DaKy/                PDF đã chèn dấu/chữ ký
  02-InvoiceDauRa/
    Goc/                 PDF chưa chèn dấu/chữ ký
    DaKy/                PDF đã chèn dấu/chữ ký
  03-DoiSoatDauVao/
    Goc/                 Biên bản chưa ký do ERP lập
    DaKyHaiBen/          Bản nhận lại đã ký cả hai bên
  04-InvoiceDauVao/
    DaKyDoiTac/          Invoice có chữ ký, dấu của đối tác
```

Tên hiển thị/tệp gửi thư: `Digicom_Kỳ_ĐốiTác_HợpĐồng_Loại_Bản_SốChứngTừ_vPhiênBản_Hash8.pdf`. Tên dùng ký tự an toàn; kỳ, số chứng từ và phiên bản giúp tra cứu, mã kiểm tra cuối tên giúp phân biệt tệp. Tên gốc do đối tác gửi vẫn được lưu trong bằng chứng nhập.

Đây là cấu trúc phân loại trong kho hồ sơ. Tệp cũ giữ vị trí và đường dẫn bất biến, không di chuyển/đổi bytes để tạo cây thư mục mới. Tệp nhận mới và bản gốc Invoice đầu ra mới được lưu trong nhánh `dossiers` của kho hiện hữu, chia theo công ty/năm/kỳ/ID đối tác/ID hợp đồng/loại, với ID tệp riêng chống trùng. Không cần thêm website hoặc cấu hình kho mới.

## Đối soát đầu vào và AP

1. Lập đủ dịch vụ theo hợp đồng, xem và lưu PDF gốc.
2. Gửi biên bản gốc cho đối tác để hai công ty ký bằng công cụ riêng.
3. Chọn **Nhận bản ký hai bên / Invoice đầu vào** ngay sau khi lưu, hoặc mở **Hồ sơ chứng từ → Đầu vào**.
4. Chọn đúng biên bản gốc và loại **Đối soát đã ký cả hai bên**. Tải PDF, mở kiểm tra hợp đồng/kỳ/nội dung/chữ ký, tích xác nhận rồi lưu. PDF tối đa16MB/200trang, không bị khóa. Hệ thống giữ nguyên bytes của tệp đã ký, không ghép hay ký lại.
5. Quay lại biên bản, chọn **Kiểm tra duyệt công nợ hợp đồng**, kiểm bản ký và xác nhận duyệt theo quyền. **Thiếu bản ký hai bên đúng phiên bản thì không tạo AP**, kể cả qua thao tác duyệt từng dòng.

Nhập tệp chỉ lưu bằng chứng, không tự tạo AP. AP đã có được giữ nguyên, chỉ duyệt phần thiếu; Invoice đầu vào không tạo thêm một khoản AP thứ hai. Khi lập lại PDF gốc, phải nhận bản ký gắn với phiên bản mới trước lần ghi AP mới. Không chuyển bản ký cũ sang bản gốc mới bằng suy đoán tên tệp.

Chữ ký do người nhập kiểm tra và xác nhận; ERP không xác minh chứng thư số hoặc kết luận chữ ký hợp lệ về pháp lý. Không sao chép chữ ký từ mẫu tham khảo.

## Invoice đầu vào

Trong cùng hồ sơ, chọn **Invoice có chữ ký, dấu đối tác**, chọn biên bản gốc, nhập đúng ký hiệu, số và ngày Invoice, tải PDF và kiểm tra trước khi xác nhận lưu. Tệp được gắn với đúng công ty/hợp đồng/đối tác/mạng/kỳ của biên bản. Nhập phiên bản mới cần kiểm bản đang có; bản cũ vẫn tra cứu được. Cùng ký hiệu/số Invoice của một đối tác trong cùng năm đã gắn ở phạm vi khác phải kiểm tra riêng, không tự ghi trùng.

## Gửi email cho mọi loại chứng từ

Đánh dấu chính xác các tệp hiện hành muốn gửi, bấm **Gửi email các tệp đã chọn**, chọn người nhận nội bộ/đối tác hoặc nhập email, sửa tiêu đề/nội dung. Bấm **Kiểm tra email và tệp đính kèm**, mở từng PDF, xác nhận rồi gửi. Bản gốc và bản ký là các lựa chọn riêng: không tự đổi bản ký sang bản gốc hoặc gửi thêm loại chưa chọn.

Gói gửi cùng một đối tác/kỳ, tối đa50tệp/18MB. Dùng cấu hình SMTP hiện có của `info@digicomjsc.com`. Quyền gửi dùng quyền nghiệp vụ hiện tại: phê duyệt đối soát đầu ra, phát hành Invoice đầu ra, duyệt đối soát đầu vào tương ứng loại tệp; không tự cấp quyền.

Xem **Lịch sử gửi** khi cần. Máy chủ nhận thư không đồng nghĩa thư đã đến Inbox. Kết quả chưa rõ/nhận một phần: kiểm lịch sử/hộp thư trước khi tạo lần gửi mới; không tự gửi lại. Gửi email không phát hành Invoice, không tạo AP/AR hoặc thu chi.

## Chứng từ cũ và sao lưu

Các bản gốc/bản ký hiện có được tra cứu theo đúng liên kết nguồn; không đổi PDF hoặc nhập lại lịch sử. Invoice cũ chưa từng lưu PDF chưa chèn dấu/chữ ký sẽ có cảnh báo thiếu bản gốc; hệ thống không dùng cấu hình hiện tại để dựng lại rồi gọi đó là bản gốc lịch sử. Từ phiên bản này, mỗi Invoice native đầu ra mới tự lưu đồng thời hai PDF gốc/đã chèn.

Sao lưu cần cả PostgreSQL và toàn bộ kho tài liệu, gồm nhánh `dossiers`; GitHub chỉ chứa mã nguồn. Không xóa phiên bản cũ hoặc sửa số liệu để khớp một baseline backup cũ.

Từ v0.6.113, nhận riêng biên bản đầu vào ký hai bên tại **Đối soát đầu vào → 2. Nhập ĐS bản ký**. Có thể chọn **Nhập bản ký** trong danh sách kỳ để điền sẵn đúng bản gốc. Hồ sơ chứng từ chung vẫn nhận Invoice đầu vào, tra cứu phiên bản và gửi email. Không thay đổi quyền hay điều kiện AP.
