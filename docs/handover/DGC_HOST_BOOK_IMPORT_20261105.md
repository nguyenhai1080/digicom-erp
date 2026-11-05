# Sổ DGC đã nhập chính thức — 05/11/2026

Đường nhập nguyên trạng đã commit trên website Digicom-Erp, DB riêng `dgc_erp_db`. Đây là lần nhập vận hành thật, không phải rollback trial. Không chạy lại bộ nhập hoặc quay lại các vòng thẩm định tính hợp lệ lịch sử.

## Phạm vi đã chuyển

Biên nhận runtime `GET /api/v1/dgc-migration/book/status` xác nhận `imported: true`, `replayed: false`, giữ nguyên giá trị nguồn, không historical cash posting và không yêu cầu thiết lập ngân hàng/quỹ.

| Dữ liệu | Số lượng |
| --- | ---: |
| Hàng nguồn | 3.243 |
| Doanh thu | 417 |
| Invoice hiện hành/nháp | 66 |
| Invoice hủy/thay thế lưu lịch sử | 37 |
| Công nợ phải thu | 53 |
| Khoản thu lịch sử | 51 |
| Đối soát đầu vào Generated | 3 |
| PDF / attachments | 451 / 451 |
| SOA/package nguồn | 82 |

Gói `00d29bbc28b33fb9faecf258e2d32733086a9884874361102862d862998e3b85`; base snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; appendix `72ea1146a315905f0047fc51dc3c107f1b341181e8d0baed7b52f828709ac5b3`. Base và các quyết định owner cũ không bị rebase. Nguồn ngày 04/11 là lượt đọc nhiều yêu cầu, không phải bằng chứng đã khóa donor; không tuyên bố bao phủ phát sinh donor sau lượt chụp này.

## Triển khai và kiểm tra trên host

Owner triển khai v15 từ release `842a1f2431cfb068c37976cdaf68ad5864af2973` (source `d66900c53f5584b37bdff27925acf373797eedf2`). v16 bật riêng captured-book để upload đủ PDF, preview toàn sổ/rollback rồi apply thành công. Master/evidence/bootstrap/seed không mở lại.

Dashboard đọc được phải thu 25.328,54 USD và doanh thu lũy kế 772.374,75 USD. Danh sách đã phát hành có 53 Invoice, phân trang 10 dòng/6 trang; lịch sử có 37 bản lưu, 10 dòng/4 trang. Lịch sử khoản thu Invoice 01/08/2026 đọc được PAY0052, đúng hiển thị nguồn và ghi rõ không cộng số dư tiền. PDF gốc của Invoice 21/09/2026 mở được trong trình duyệt. Đây là kiểm tra đọc trên host, không phát hành nháp, duyệt đối soát hoặc tạo khoản thu thử trên dữ liệu thật.

Đã tạo bản sao PostgreSQL sau nhập ngày 05/11 lúc 05:40, trạng thái Thành công, 2,3 MB. Bản sao website/kho dữ liệu ứng dụng và cấu hình lúc 05:41 cũng hoàn tất, trạng thái Thành công, 842 MB. Đây là xác nhận tạo backup trên host; chưa tải/restore thử lại bản backup mới này tại localhost. Không xóa các bản trước chuyển.

v17 đã trực tuyến sau khi đặt DGC_CAPTURED_BOOK_ENABLED=false. Runtime xác nhận importEnabled=false/imported=true và biên nhận/counts không đổi. Cấu hình host đọc lại: captured-book, master, evidence, bootstrap, seed và cash đều false. Không thay pin gói hoặc dữ liệu tài chính. Tệp Invoice 21/09/2026 tải lại qua link ERP sau v17 có 720.215 bytes, SHA256 `10fa23907252d284ceb417ec55ee05cf97eeac57a64145ad45d51ea3bfa8c0c3`, trùng chính xác blob nguồn. Trình xem PDF khi reload có lúc không hiển thị; kiểm tải tệp thực tế thành công, không kết luận mất file từ trình xem trống.

## Phạm vi vận hành

Giữ 13 Invoice nguồn Draft là Draft; không tự phát hành. Ba Input Recon Generated không tự duyệt hoặc sinh AP. Các cảnh báo và PDF nguồn được giữ nguyên; năm original Recon thiếu không được gọi là đã khôi phục. Thu lịch sử không vào CashEntry/tài khoản tiền. Khoản thu mới dùng LEDGER_ONLY trong giai đoạn quỹ/ngân hàng để sau. Tiền tệ vận hành USD/VND; timezone báo cáo Asia/Ho_Chi_Minh.

Không coi lần chuyển này là nghiệm thu toàn bộ parity, phân quyền nhân viên hay UAT có người dùng. Các kiểm tra ghi nghiệp vụ đã thực hiện trên Linux synthetic (43 HTTP và tám issue checks), không lặp lại trên sổ thật. Không tiếp tục ghi song song vào donor sau khi owner bắt đầu vận hành ERP; nếu có phát sinh ngoài snapshot thì xử lý riêng theo nguồn, không import lại hoặc ghi đè toàn sổ.

Biên nhận và ảnh riêng tư ở `artifacts/dgc-migration/20261105/`; không đưa chúng, gói nguồn, PDF hoặc secrets vào Git/deployment.

## Tiếp tục: sẵn sàng phân quyền nhân viên

Đã kiểm lại mã nguồn hiện hành trên DB giả lập riêng, đủ 27 migrations: 234 DGC role/manual-revenue/FX/receipt assertions đạt; 24 user-management checks với delegates cô lập đạt. Bổ sung kiểm hồi quy cho cash deferral: khi không bật DGC_CASH_ENABLED, Manager vẫn có canPost cho thu sổ nhưng không nhận cash-account catalog; Kế toán chỉ đọc lịch sử, không canPost; GST giữ hành vi hiện hữu. Kiểm cả nhánh bật cash riêng rồi phục hồi biến môi trường. Không thay quyền trong runtime, không seed/gán role hoặc sửa sổ host.

[Hướng dẫn vận hành](../DGC_OPERATING_START.md) liệt kê luồng nghiệp vụ và ma trận bốn vai trò theo mẫu hiện có. Đã hỏi owner họ tên/email/vai trò nhân viên để chuẩn bị bước tiếp theo; chưa có danh sách tại thời điểm ghi nhận. Không đòi mật khẩu trong chat. Lượt cập nhật này chỉ có test/tài liệu, không yêu cầu tạo release/deploy lại website hoặc mở bộ nhập.

## Đã xác minh tài khoản sau owner lưu

Owner cung cấp ba người và đã tự hoàn tất mật khẩu/lưu trên ERP. Đã đọc lại danh sách: ba nhân viên cùng quản trị viên ban đầu đều Hoạt động; ba nhân viên mới đều Chưa đăng nhập. Không tạo tài khoản trùng, không reset mật khẩu hoặc thay cấu hình owner.

Ba role mới khớp chính xác mẫu runtime theo API đọc `/api/v1/users/roles`: DGC_MANAGER 38 quyền, DGC_BOD 48 quyền, DGC_ACCOUNTANT 24 quyền. Cấu hình owner thực tế có thêm DGC_ACCOUNTANT cạnh DGC_MANAGER và ADMIN cạnh DGC_BOD. Đã thông báo chênh lệch và ý nghĩa toàn quyền của ADMIN, giữ nguyên lựa chọn owner vừa lưu. Không tự coi assignment này là mẫu mặc định cho người dùng khác.

Đã đọc lại biên nhận book: imported=true/importEnabled=false, counts vẫn 417 revenues/66 native Invoice/37 archive/53 AR/51 receipts/3 Input Recon/451 documents và 3.243 source rows. Lượt xác minh tài khoản không ghi nghiệp vụ, không mở importers hoặc cash, không thử đăng nhập thay nhân viên. Hồ sơ/ảnh tài khoản có thông tin cá nhân chỉ lưu private `artifacts/dgc-migration/20261105/users/`. Không gửi thông báo/email cho nhân viên. Bước tiếp theo là nhân viên đăng nhập và nghiệm thu công việc thực tế; không gọi trạng thái tài khoản ACTIVE là bằng chứng đã đăng nhập/UAT đạt.
