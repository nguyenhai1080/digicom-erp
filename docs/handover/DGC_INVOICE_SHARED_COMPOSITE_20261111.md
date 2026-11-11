# Invoice dùng chung ảnh ký ghép của đối soát — v0.6.103

Owner yêu cầu dùng nguyên bộ dấu/chữ ký/chức danh đã ghép cho đối soát và bỏ tên/chức danh in riêng trên Invoice. Yêu cầu này thay thế hướng dẫn hai ảnh riêng của v0.6.102 trở về trước.

## Thay đổi

- Invoice DGC đọc đúng Document CompanyAsset/SIGNING_COMPOSITE đang ACTIVE, qua cùng asset resolver/checksum như đối soát. Dùng trực tiếp bytes/id/version đó; không ghép lại, upload bản sao, xóa ảnh gốc, đổi cấu hình hay ghi lên host.
- Renderer chỉ vẽ một ảnh ghép trong vùng ký cuối trang. Bỏ hoàn toàn việc vẽ profile.signatureName/profile.signatureTitle thành chữ; giữ lời cảm ơn và form/ngân hàng/tiền như cũ. Các trường profile gốc giữ nguyên để bảo toàn cấu hình và bằng chứng, không còn in trên Invoice mới.
- Preview có một ảnh kéo/kích thước/vị trí riêng cho mỗi Invoice. Vẫn chỉ tải Invoice đang chọn, giữ cache/vị trí, bắt buộc kiểm đủ PDF và xác nhận trước lưu Nháp. Bundle ba dịch vụ con giữ một Invoice/ba dòng.
- API dùng placement đơn cho DGC như ảnh ghép GST. Từ chối payload cũ dgcPlacement tách hai ảnh, cũng như yêu cầu tải riêng stamp/signature ở endpoint Invoice; thông báo mở lại Preview. Không đổi renderer GST.
- rendererRevision DGC_MOVTV_COMPOSITE_V4 và metadata signing id/version/checksum nằm trong digest/snapshot; ký mới lưu signingMode=DGC_COMPOSITE và placement đơn. Tài sản thay phiên bản làm preview cũ hết hiệu lực. PDF đã lưu đọc nguyên bytes cũ, không dựng lại theo ảnh mới.
- Giữ khóa nguồn/số thứ tự, chống trùng, Origin/CSRF/quyền, atomic create/rollback, layout-only/giới hạn tài nguyên và vùng ký không đè thanh toán/tràn trang. Không thêm schema/env/role/cash hoặc nhập lại sổ.

## Kiểm chứng

- API/web build và 69 unified-web assertions đạt.
- PDF characterization: bố cục/số tiền/nhóm/8 dòng một trang/nhiều trang/font nhúng/vị trí hợp lệ giữ nguyên với một ảnh ghép. PyMuPDF xác nhận không có tên/chức danh profile trong text; một ảnh ký ở trang cuối (ngoài logo), text nằm trong khổ trang. Đã render và nhìn lại bản tám dòng với ảnh giả lập.
- 44 browser checks giả lập: một overlay, lấy signingAsset chung không có kind stamp/signature, giữ vị trí theo Invoice, payload placement đơn, invalid PDF riêng, kiểm đủ PDF/xác nhận, save/retry/resume/mobile, GST và quyền không đổi. Không gọi host thật.
- Linux API kiểm dùng cùng bytes ảnh cho endpoint Invoice và đối soát, bắt buộc có composite, không fallback ảnh rời; preview cũ bị từ chối khi asset đổi, file Invoice đã lưu giữ nguyên. Linux Node22/CPU0.3/RAM512MB/heap192MB và PostgreSQL16 giả lập riêng: 237 API assertions đạt. Kiểm cả đổi ảnh nguồn/ghép sang phiên bản mới qua API cấu hình bình thường, digest preview cũ bị chặn và PDF Invoice đã lưu vẫn đúng nguyên bytes. Các thay ảnh trong test chỉ ở DB/kho giả lập riêng, không thay ảnh đã được owner lưu trên host.

Bằng chứng private artifacts/invoice-composite-20261111 và artifacts/sidebar-layout-check/invoice-workspace-composite.mjs. Không đưa ảnh/PDF gốc hoặc tài khoản thật vào Git.

## Phát hành

Đẩy nguồn dgc/main và nhánh một website codex/dgc-deploy. Owner triển khai rồi tải lại trang, mở Xem trước Invoice mới; không dùng preview cũ. Dùng sẵn ảnh ghép đối soát, không cần upload hay cấu hình lại. PDF đã lưu không tự đổi; muốn thay bản Nháp thì owner làm qua luồng bình thường.
