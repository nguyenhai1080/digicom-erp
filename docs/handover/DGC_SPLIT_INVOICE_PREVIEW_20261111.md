# Tách Invoice theo dịch vụ: timeout và nhóm dịch vụ con — v0.6.101

## Nguyên nhân và quy tắc owner

Ảnh owner báo signal timed out ở bước Xem trước Invoice, PER_SERVICE/Tất cả dịch vụ. UI dùng ngân sách 15 giây cho endpoint preview; server dựng và serialize PDF đầy đủ cho từng nhóm chỉ để lấy vị trí ký, ngay trong transaction đọc cũng giới hạn 15 giây. Không cần có lỗi dữ liệu mới gặp timeout khi nhiều nhóm hoặc host bận.

Owner nhắc rõ: tách theo dịch vụ tổng; gói ba dịch vụ con phải cùng một Invoice với ba dòng, không tách thành ba Invoice và không cộng thêm dòng tổng vào chi tiết. Giữ grouping theo header TOTAL/serviceId hiện hành; children chỉ mở rộng nội dung trong dgcInvoiceLines, phạm vi doanh thu/sequence vẫn tính một tổng. Không ghép dịch vụ không liên quan theo tên hoặc số tiền.

## Sửa

- DGC renderer có chế độ layoutOnly nội bộ: dùng cùng bố cục, font và kiểm vị trí/khổ trang, nhưng không serialize PDF/subset font chỉ để lấy suggested placement. Full preview PDF, PNG và lưu nháp vẫn tạo PDF đầy đủ như trước. Cờ này không có trong payload HTTP.
- Preview bắt snapshot bằng transaction RepeatableRead hiện hành rồi giải phóng connection trước dựng bố cục; không kéo dài transaction đọc vì tạo PDF. Preview PDF/create vẫn lập lại kế hoạch, đối chiếu digest nguồn/asset/sequence mới và giữ các khóa/rollback cũ.
- Dùng cùng giới hạn một tác vụ Invoice đang xử lý như các endpoint PDF/create; yêu cầu chồng nhau nhận 429, trạng thái được thả trong finally cả khi lỗi.
- UI dành tối đa 65 giây riêng cho preview như luồng tạo Invoice; có thông báo đang chuẩn bị từng dịch vụ. Timeout có thông báo tiếng Việt rõ bước xem trước chưa lưu Invoice, không hiện nguyên văn lỗi signal.
- Font/form, số tiền, cách đánh số, quyền, Origin/CSRF, schema/env, GST renderer và tài liệu đã lưu không đổi. Không thử tạo Invoice trên sổ thật.

## Kiểm chứng

- Build API/web và Invoice characterization đạt, gồm layout-only trả buffer rỗng/cùng vị trí với bản đầy đủ và vẫn chặn vị trí không hợp lệ; font nhúng/8 dòng một trang/nhiều trang giữ nguyên.
- 69 unified-web API checks đạt.
- 16 browser checks dùng Fastify/CSP và API giả lập: response preview trễ 16 giây vẫn hiện 8 Invoice, gói ISIGN/VOICEMAIL/MCA chung một article ba dòng; timeout giả lập có thông báo rõ, nút thử lại hoạt động, không gọi create. Kiểm timeout preview 65000 ms và nút lưu khóa trước PDF/xác nhận.
- Benchmark riêng với cùng 8 Invoice giả lập trên Linux Node22/CPU0.3/RAM512MB/heap192MB: dựng PDF đầy đủ trước sửa 8516 ms, layout-only 5713 ms. Đây là benchmark local, không phải SLA hoặc thời gian host thật; ngân sách chờ và connection đã được sửa riêng.
- Test API bổ sung dùng 8 TOTAL, trong đó một TOTAL có ba CHILD (30/30/40), giữ tiền tổng 100/10/90: một Invoice cho gói, không có Invoice con hoặc dòng tổng thứ tư; preview không ghi file/sequence/sổ, thao tác chồng bị chặn và lưu tám nháp đúng scope tổng. Linux Node22/CPU0.3/RAM512MB/heap192MB, DB PostgreSQL16 tmpfs riêng: 205 API assertions đạt. Riêng preview/kiểm/lưu cả tám Invoice mất 13583 ms trong lần chạy này. Không coi thử nghiệm giả lập là nghiệm thu sổ thật.
- Bằng chứng private artifacts/invoice-font-20261111/split-*. Không thao tác hồ sơ thật, không phát hành Invoice hoặc tạo AR thay owner.

## Triển khai

Đẩy source dgc/main và nhánh một website codex/dgc-deploy. Owner triển khai rồi tải lại trang, chọn Tách theo dịch vụ/Tất cả dịch vụ và Xem trước Invoice lại. Gói ba dịch vụ con có một Invoice, ba dòng chi tiết. Kiểm từng PDF rồi owner tự lưu nháp. Giữ chống trùng giữa chế độ gộp/tách và PDF lịch sử; không xóa/reset sổ để thử lại.
