# Quyền DGC Finance — 20/10/2026

Cập nhật tiếp: quyền tạo tỷ giá của Manager đã được tách và kiểm thử tại [DGC_FX_ACCESS_20261020.md](DGC_FX_ACCESS_20261020.md); quyền Staff đọc lịch sử thu đã được tách tại [DGC_RECEIPT_READ_20261020.md](DGC_RECEIPT_READ_20261020.md). Các nhận định hai quyền này cần tách bên dưới mô tả khoảng trống tại thời điểm đợt đầu; upsert/revision tỷ giá và toàn bộ quyền chứng từ donor vẫn chưa được port.

## Phạm vi đã triển khai

Tách quyền doanh thu nhập tay khỏi quyền xử lý OCR cho tenant DGC. Trước đây submit dùng `RECON_REVIEW`, cũng mở sửa số tài chính OCR. Donor `30_Revenue.js:74` cho Staff gửi doanh thu, trong khi `22_Recon_PDF_Approval.js:397` chỉ cho Manager/BOD sửa OCR. Không cấp `RECON_REVIEW` cho Staff để giải quyết submit.

| Thao tác nhập tay | Quyền DGC mới | Mẫu Staff | Mẫu Manager/BOD |
| --- | --- | --- | --- |
| Tạo/import preview | MANUAL_REVENUE_CREATE | Có | Có |
| Sửa nháp | MANUAL_REVENUE_EDIT | Có | Có |
| Gửi kiểm tra | MANUAL_REVENUE_SUBMIT | Có | Có |
| Duyệt ghi nhận doanh thu | MANUAL_REVENUE_APPROVE | Không | Có |
| Hủy bản chưa duyệt | MANUAL_REVENUE_CANCEL | Không | Có |

Guard xác thực trước khi chọn quyền theo companyCode trong session, sau đó vẫn kiểm Origin/CSRF. Tenant DGC không fallback sang quyền RECON cũ. Tenant GST giữ create/edit=RECON_UPLOAD, submit=RECON_REVIEW, approve=RECON_APPROVE, cancel=RECON_CANCEL. Không sửa công thức, nguồn, status transition, transaction, số tiền hoặc cash posting.

API references và revenue list trả action flags để UI dùng cùng quy tắc với server. UI thêm nút Gửi kiểm tra cho DRAFT. Bảng vẫn 10 dòng/trang, đối tác hiển thị partnerKey.

## Mẫu quyền đề xuất

`apps/api/src/modules/auth/dgc-role-presets.ts` mô tả DGC_STAFF, DGC_MANAGER, DGC_BOD với function/file/line donor, loại bằng chứng và ghi chú khác biệt. `/users/roles` chỉ trả mẫu cho DGC có USER_VIEW và ROLE_CREATE; đọc mẫu không tạo role, permission, user hoặc audit.

Trong Quản trị người dùng → Thêm vai trò, chọn mẫu chỉ điền mã/tên và checklist. Phải lưu bằng luồng ROLE_CREATE hiện có; việc gán người dùng là bước riêng. Mẫu thiếu bất kỳ permission nào trong tập quyền có thể cấp sẽ bị vô hiệu hóa; không cắt bớt quyền âm thầm. Server tiếp tục chống cấp quyền vượt actor, trùng mã và sai tenant.

**Đây là mẫu đề xuất cho chức năng đã triển khai, `proposalOnly:true`, `fullParity:false`; không phải nghiệm thu toàn bộ quyền donor.** Không seed hoặc gán Staff/Manager/BOD cho tài khoản thật. Baseline seed chỉ bổ sung năm permission mới vào ADMIN kỹ thuật như các permission hiện có; chưa chạy seed trên staging dữ liệu thật. Trước triển khai phải provision rõ năm quyền mới cho role DGC cần dùng; role chỉ có RECON cũ sẽ không có quyền nhập tay DGC.

Khác biệt và phần còn thiếu:

- Sửa nháp, hủy nháp và custom RBAC là adaptation của target, không gán nhãn donor parity. Sửa thông tin/role người dùng cũng rộng hơn donor reset-password.
- Direct output finalization Manager/BOD khác luồng aggregate cũ chỉ BOD; chưa hợp nhất hai luồng. Restamp đã duyệt cần thêm RECON_RESTAMP (BOD).
- INPUT_RECON_APPROVE chỉ BOD; Manager có generate/preview. INPUT_RECON_VIEW hiện cũng chứa pending-source inspection nên chưa mở cho Staff như quyền xem bảng chung.
- PAYMENT_VIEW chứa cả báo cáo cash nên mẫu tạm giới hạn Manager/BOD; đọc lịch sử payment của Staff chưa đủ parity. Manager FX cần quyền riêng vì SYSTEM_CONFIG_EDIT còn sửa profile/tài sản ký; mẫu giữ quyền bundle này ở BOD theo adaptation thận trọng, không coi quyền đọc config của donor là bằng chứng cho mọi thao tác ghi.
- Projects, SOA/package, diagnostics/repair và toàn bộ khác biệt đọc/FX chưa nằm trong phạm vi mẫu. Generic reader donor không luôn bắt login; target luôn xác thực.

## Kiểm chứng và giới hạn

- Build workspace Node 22/pnpm 10 đạt.
- Integration role/manual revenue **100 assertions đạt** trên DB PostgreSQL disposable schema 21: Staff create/edit/submit, cấm OCR/approve; Manager approve; quyền nhập tay riêng không mở OCR; legacy DGC bị chặn, GST cũ vẫn chạy; CSRF/origin, giả tenant, financial amounts, no cash, GET mẫu không mutation; tạo đúng ba role, không tự gán user, chống trùng và cấp quyền vượt actor.
- Hồi quy: DGC Invoice **149**, InputRecon/AP **187**, tài chính nền GST **264** assertions đạt; characterization tài chính **85** đạt.
- Chưa kiểm tương tác browser của selector mẫu/nút submit trong đợt này; build/API không thay thế nghiệm thu UI hoặc full role parity.

Lệnh suite: `pnpm --filter @erp/api test:dgc-roles`, sau build, với DB mới hoàn toàn có prefix `erp_execution_acceptance_dgc_roles_`. Lượt xác nhận cuối dùng `erp_execution_acceptance_dgc_roles_network_20261020`, container chạy chung network namespace với PostgreSQL, kết nối localhost:5432 và connection_limit=5. Các lần trước vướng runtime Windows/DB đã dùng và kết nối host.docker.internal không được tính là pass; không tái sử dụng DB đã có user để chạy lại suite.

Không đổi snapshot, ba proposal financial links, source Sheets, lịch sử financial import, timezone hoặc SOA cutoff. Hai nhóm câu hỏi owner vẫn chờ câu trả lời cụ thể. Không push hoặc deploy.
