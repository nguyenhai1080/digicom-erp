# Roadmap DGC ERP hiện tại — 06/11/2026

## Đã hoàn tất trên host

- Một website DGC riêng, PostgreSQL và kho tài liệu riêng; toàn sổ chụp 04/11 đã chuyển. Bộ nhập/master/evidence/bootstrap/seed đã đóng.
- Tài khoản nhân viên đã được owner tạo; mẫu quyền đã đọc lại. Đăng nhập và nghiệm thu thực tế của từng nhân viên còn cần theo dõi.
- Invoice profile và các ảnh gốc DGC đã cấu hình. Owner đã chấp nhận ảnh ký ghép v3 cho đối soát; v20 online trước lần đổi tên miền.
- Tháng 10/2026 cũ đã lưu lịch sử; owner tự nhập lại đối soát và lập Invoice để thử nghiệp vụ. Không nhập, ký hoặc phát hành thay owner.

## Đang làm và thứ tự tiếp theo

1. **Ưu tiên phát sinh: tên miền erp.digicomjsc.com.** Đã cập nhật APP_URL trên đúng Digicom-Erp, v21 online; origin chính thức qua guard, origin lạ/thiếu Origin vẫn 403. [Bàn giao tên miền](handover/DGC_OFFICIAL_DOMAIN_20261105.md).
2. **SOA vận hành.** Đã triển khai v23: preview/PDF/lưu nháp, phân trang, ba ảnh ký trang cuối và hủy nháp bảo toàn PDF; đăng ký toàn bộ liên kết Invoice cùng transaction. Windows/Linux 131 + hồi quy 64 đạt; đường đọc host đã kiểm ngày 06/11. Xem [bàn giao SOA](handover/DGC_SOA_RUNTIME_20261105.md). Chưa phát hành SOA thật hoặc thay sổ host. Khoản thu chỉ tính đến hết ngày chốt theo quyết định owner.
3. **Nghiệm thu luồng sau cắt chuyển:** owner tự nhập lại tháng 10 → chốt đối soát → doanh thu → Invoice nháp. Theo dõi vấn đề thực tế; phát hành/ghi khoản thu chỉ khi người dùng chủ động thực hiện nghiệp vụ.
4. **Đầu vào/phải trả và báo cáo:** nghiệm thu theo vai trò và dữ liệu phát sinh mới; kiểm đầy đủ PDF và truy xuất nguồn. Không tự duyệt ba hồ sơ Generated lịch sử.
5. **Sao lưu/khôi phục sau chuyển:** đã có backup thành công; cần diễn tập restore bản sau nhập trên môi trường riêng. Không khôi phục đè DB thật.
6. **Projects mở rộng** sau khi luồng Finance đã nghiệm thu. Quỹ/ngân hàng và số dư tiền chờ owner yêu cầu, không chặn vận hành hiện tại.

Không tiếp tục thẩm định tính hợp lệ số liệu cũ, không mở lại importer, không đổi số tiền/PDF nguồn. Các bảng roadmap cũ ghi “chưa nhập tài chính” là lịch sử trước chuyển, không phải trạng thái hiện tại. Không dùng số test, trạng thái online hoặc tài khoản ACTIVE để tuyên bố full UAT/parity.


