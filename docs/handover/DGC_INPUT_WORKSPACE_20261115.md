# Đối soát đầu vào — ba phần riêng, v0.6.113

## Kết quả

- Tạo ĐS đầu vào: chọn kỳ/hợp đồng/mạng/ngày, lập đủ dịch vụ chi tiết theo hợp đồng; bỏ các nút chuyển nguồn/danh sách cũ và chú thích dài trên màn tạo.
- Nhập ĐS bản ký: biểu mẫu riêng cho biên bản ký hai bên, mở kiểm tra PDF gốc và tệp nhận, xác nhận trước lưu. Chọn từ danh sách điền sẵn đúng nguồn; lưu thành công quay về danh sách. Không lẫn các trường Invoice/email ở bước này.
- Danh sách đối soát: một ACTIVE saved InputReconStatement PDF mỗi dòng, kỳ mới đến cũ, thời gian lưu/id giảm dần trong cùng kỳ. Mặc định mọi kỳ, lọc hợp đồng/kỳ, 10 dòng/trang. Tách PDF gốc chưa ký/PDF đã ký hai bên, phiên bản, mạng và trạng thái; chi tiết/duyệt giữ luồng hiện hữu. Nháp chưa lưu PDF vẫn ở bước tạo. Không cộng tiền hay gộp đoán các PDF cũ khác nhau.

GET `/api/v1/input-recon/statements` chỉ DGC/INPUT_RECON_VIEW, tenant và liên kết bản gốc/hợp đồng/kỳ/đối tác được kiểm tra. Bản ký chỉ lấy receipt ACTIVE liên kết đúng original PDF và scope; thiếu/không rõ hiển thị riêng, không dùng bản khác thay thế. URL đọc PDF tiếp tục dùng resolver được phân quyền của dossier. Không đọc lại/tính lại sổ.

Giữ v112: upload bytes nguyên trạng, attestation thủ công, version/replay guards, AP chỉ tạo khi đủ signed evidence và xác nhận duyệt có quyền. Nhập file không tự duyệt. Invoice đầu vào và email ở Hồ sơ chứng từ. Không thay đổi GST/captured/số tiền/PDF đã lưu/schema/env/roles/cash; không thực hiện upload/duyệt/gửi mail/host thật.

## Kiểm tra

API và web build/type-check đạt. DB dùng một PostgreSQL tạm riêng: 481 InputRecon/AP và 99 dossier assertions; thêm reader authorization, filter/order/pages, paired original/signed, missing signed. Browser dữ liệu giả: 29 workspace +27 dossier checks, ba tab/bàn phím/mobile390px/không POST AP, xác nhận nhập, quyền đọc và thư viện chung. Ảnh desktop/mobile được kiểm tra tại artifacts cục bộ, không đưa dữ liệu riêng vào Git.

Đóng gói giữ build đã type-check, source/compiled manifest có hash. Owner triển khai nhánh codex/dgc-deploy; mở mới UI v0.6.113 và kiểm tra thực tế ba tab, đúng cặp PDF, nhập bản ký rồi tự duyệt. Không suy ra đã deploy hoặc đã nghiệm thu tài chính từ các kiểm tra giả.
