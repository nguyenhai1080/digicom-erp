# Roadmap Digicom ERP — rà soát 10/11/2026

**Trạng thái:** chuyển sổ đã hoàn tất; bản v0.6.92 đã online. Trọng tâm tiếp theo là nghiệm thu vận hành trên dữ liệu phát sinh thật. Không còn chờ triển khai các bản UI v0.6.82–0.6.92 như ghi chú cũ.

**Bổ sung 10/11:** v0.6.93 đã chuẩn bị luồng đối soát đầu vào theo hợp đồng và tạo nháp nhiều dịch vụ, xem PDF/duyệt AP theo quyền. Chờ triển khai và owner nghiệm thu trên kỳ phát sinh. [Bàn giao](handover/DGC_INPUT_CONTRACT_WORKFLOW_20261110.md), [hướng dẫn](DGC_INPUT_RECON_GUIDE.md).

**Mẫu in đầu vào v0.6.94:** đã dựng lại theo form owner sau phản hồi v0.6.93; chờ triển khai, PDF đã lưu cũ không bị ghi đè. [Bàn giao mẫu in](handover/DGC_INPUT_FORM_20261110.md).

**Luồng hợp đồng v0.6.95:** đã chuẩn bị kiểm đủ các dịch vụ con và nguồn khi tạo nháp/lập biên bản; chọn một dòng tự xem toàn hợp đồng, giữ bản đã có và bổ sung phần thiếu. Chờ triển khai và owner thử lại. [Bàn giao](handover/DGC_INPUT_FULL_CONTRACT_20261110.md).

**Sửa cấp tổng/chi tiết v0.6.96:** chỉ dùng dịch vụ con, giữ dòng tổng để tham chiếu; thao tác chọn hợp đồng/kỳ trực tiếp, bỏ chọn từng dịch vụ. [Bàn giao mới](handover/DGC_INPUT_CONTRACT_FIRST_20261110.md). Chờ triển khai và owner lập PDF mới.

**Tương thích nháp tổng cũ v0.6.97:** giữ dòng tổng đã bỏ khỏi cấu hình hợp đồng như tham chiếu, không chặn hoặc cộng vào biên bản ba dịch vụ con. [Bàn giao](handover/DGC_INPUT_LEGACY_TOTAL_20261110.md). 360 API/24 browser đạt; chờ triển khai.

**Đối soát đầu ra v0.6.98:** sửa lỗi chốt khi CRBT và MEUBEAT_(CRBT) là cùng một dịch vụ. Giữ hai dòng nguồn nhưng chỉ ghi một doanh thu nếu khớp toàn bộ tiền/hợp đồng. [Bàn giao](handover/DGC_RECON_ALIAS_POSTING_20261110.md). Kiểm thử đạt; chờ triển khai và owner tự chốt RUP0006.

**Mẫu Invoice v0.6.99 — 11/11:** chuẩn bị đúng form MOVTV owner xác nhận, sửa ảnh trang xem trước bị CSP chặn. [Bàn giao](handover/DGC_INVOICE_OWNER_FORM_20261111.md). Mẫu GST/REGISTAR đã được owner rút lại. Chờ triển khai và tạo lại preview; giữ nguyên PDF đã lưu.

**Font Invoice v0.6.100:** nhúng bộ chữ tương thích Arial, đủ regular/bold/tiếng Việt, thay Helvetica không nhúng của v0.6.99. [Bàn giao](handover/DGC_INVOICE_EMBEDDED_FONTS_20261111.md). Chờ triển khai và xem trước lại; PDF đã lưu giữ nguyên.

## Đã hoàn thành và có bằng chứng

| Hạng mục | Trạng thái xác nhận | Bàn giao |
|---|---|---|
| Môi trường Digicom riêng | Một website, DB và kho tài liệu riêng; tên miền erp.digicomjsc.com đã cấu hình | [Tên miền](handover/DGC_OFFICIAL_DOMAIN_20261105.md) |
| Chuyển toàn sổ | Đã nhập thật ngày 05/11: 417 doanh thu, 66 Invoice hiện hành/nháp, 37 bản lưu, 53 AR, 51 khoản thu, 3 InputRecon Generated, 451 PDF. Các số này là biên nhận lúc nhập, không phải số lượng hiện tại | [Biên nhận nhập](handover/DGC_HOST_BOOK_IMPORT_20261105.md) |
| Lưu hồ sơ kỳ 10 để nhập lại | Đã lưu 8 Invoice nháp, 8 doanh thu, 5 nhóm đối soát và 18 PDF; không chạy lại thao tác này | [Mở lại kỳ 10](handover/DGC_OCTOBER_RESTART_20261105.md) |
| Nhân viên và tài sản chứng từ | Tài khoản/quyền đã được owner lưu; profile Invoice, ảnh gốc và ảnh ký ghép đã cấu hình. Chưa coi đây là nghiệm thu đăng nhập/nghiệp vụ của nhân viên | [Tài sản](handover/DGC_COMPANY_ASSETS_ACTIVATED_20261105.md) và bằng chứng tài khoản riêng ngày 05/11 |
| SOA và InputRecon lịch sử | SOA vận hành đã triển khai; InputRecon captured có xem/in riêng và giữ nguyên số tiền, không tính lại | [SOA](handover/DGC_SOA_RUNTIME_20261105.md), [InputRecon](handover/DGC_INPUT_CAPTURED_PRINT_20261106.md) |
| Tỷ giá GST → Digicom | Ngày 06/11 đã thêm 96 kỳ, tổng 97 kỳ; giữ nguyên 01/2026. Không nhập lại hoặc lấy tỷ giá tháng 9 thay tháng 10 | [Tỷ giá](handover/DGC_GST_FX_APPLIED_20261106.md) |
| Menu, thương hiệu, tra cứu đối soát | Các nhóm tab đã gộp; tên hiển thị Digicom; danh sách mới đặt trước đối soát đã chuyển, có mở PDF gốc theo liên kết nguồn | [Menu](handover/DGC_GROUPED_MENUS_20261106.md), [Đối soát](handover/DGC_OUTPUT_RECON_HISTORY_20261107.md) |
| Thu chi chờ áp dụng | Đã hiện menu và 5 tab Chưa thiết lập. Chưa kích hoạt tài khoản/quỹ/số dư/giao dịch, không có request tiền từ màn chờ | [Thu chi](handover/DGC_CASH_MENU_DEFERRED_20261107.md) |
| Dashboard kết hợp | v0.6.92 có doanh thu năm đến kỳ chọn, tăng trưởng, AR hiện tại, Tài khoản; xu hướng/đóng góp dịch vụ, việc cần xử lý; giữ Phải trả và toàn lịch sử ở hàng phụ | [Dashboard](handover/DGC_DASHBOARD_BUSINESS_20261107.md) |
| Sao lưu và diễn tập khôi phục | Đã phục hồi backup thật trên localhost ngày 06/11; sau nhập FX đã so dump trước/sau. Cảnh báo metadata timestamp của 26 payload vẫn giữ nguyên, không gọi là sạch mọi hash | [Khôi phục](handover/DGC_BACKUP_RESTORE_20261106.md), [FX trước/sau](handover/DGC_GST_FX_APPLIED_20261106.md) |

### Kiểm tra triển khai ngày 10/11

GET công khai tại tên miền chính thức trả health release **0.6.92**, status ok, database connected. Giao diện tải asset `/assets/index-CTXvoaaV.js`, SHA256 `46fc62a9269f07489fbd2aaab9cab52d45d726e2dc5b08b0afe0f1781716bebb`, khớp byte với gói đã chuẩn bị từ source `cb6eb71` / deployment branch `98c1e4d`. Hai nhánh GitHub cũng khớp các commit đó tại lần kiểm.

Bằng chứng riêng: `artifacts/roadmap-review-20261110/public-deployment.json`. Đây là kiểm bản phát hành công khai, không đăng nhập hoặc đọc sổ hiện tại; chưa chứng minh dữ liệu Dashboard/UAT người dùng. Public config vẫn có tên cũ DGC ERP; UI đã chuẩn hóa thành Digicom ở lớp hiển thị theo quyết định owner, không cần sửa mã tenant.

## Việc cần làm tiếp — theo thứ tự

1. **Nghiệm thu luồng kỳ 10/2026.** Owner/kế toán tự upload đối soát → kiểm tra/chốt → xem doanh thu → xem trước PDF/lưu Invoice nháp. Xác nhận ngày, kỳ, dịch vụ, số tiền, mẫu in và quyền đúng khi thao tác thật. Trợ lý hỗ trợ sửa lỗi phát hiện; không nhập/chốt/ký/phát hành thay owner, không tái lưu lịch sử hoặc khôi phục bản thử cũ. [Hướng dẫn](DGC_OCTOBER_REENTRY_GUIDE.md).
2. **Xác nhận tỷ giá kỳ đang thử trong quá trình nghiệm thu.** Tại lần đọc GST ngày 06/11 chưa có 10/2026; chưa có bằng chứng trong lượt rà soát 10/11 rằng kế toán đã nhập sau đó. Kế toán nhập khi có số chốt, không tự suy hoặc lấy kỳ trước thay. Không ghi điều này thành lỗi triển khai hoặc điều kiện nhập lại lịch sử.
3. **Nghiệm thu tài khoản và quyền nhân viên.** Từng người tự đăng nhập, thử các màn/chức năng thuộc quyền thực tế. Giữ các gán quyền owner đã lưu; không login-as, đổi mật khẩu hoặc tự bổ sung quyền để vượt lỗi.
4. **Nghiệm thu báo cáo và chứng từ từ phiên sử dụng thật.** Dashboard lọc năm/kỳ/dịch vụ/USD–VND, tổng không trùng dịch vụ con; AR là sổ hiện tại; SOA chỉ tính khoản thu đến ngày chốt; PDF gốc mở đúng. Kiểm InputRecon/AP khi có nghiệp vụ phát sinh được owner chủ động thực hiện, không duyệt ba hồ sơ Generated cũ để làm test.
5. **Chốt bàn giao vận hành.** Ghi nhận kết quả nghiệm thu/lỗi đã xử lý, người phụ trách, cách sao lưu và khôi phục. Tình trạng backup tự động hiện tại chưa được kiểm trong lượt đọc công khai này; diễn tập từ xa/khôi phục đè host chưa thực hiện. Không mở lại kiểm tính hợp lệ tiền/PDF lịch sử để kéo dài cắt chuyển.

## Chưa áp dụng, không phải lỗi thiếu chức năng

- **Quỹ/ngân hàng và thu chi thật:** chỉ có menu chờ thiết lập; chỉ bắt đầu cấu hình tài khoản/quỹ, số dư và vận hành khi owner yêu cầu riêng. Không hồi tố khoản thu lịch sử thành CashEntry.
- **Projects mở rộng:** sau nghiệm thu Finance. Không dùng workflow Projects thay nghiệp vụ dịch vụ/đối soát/Invoice.
- **Rà soát ngữ nghĩa số liệu cũ, nhập lại sổ hoặc sửa raw/hash/PDF:** không thuộc công việc tiếp tục. Giữ cảnh báo và bằng chứng đã có; không coi các mốc trial cũ là công việc chuyển sổ còn treo.

Không dùng trạng thái online, tài khoản ACTIVE hoặc test giả lập để tuyên bố đã nghiệm thu đầy đủ. Không yêu cầu owner xác nhận lại các mapping/quyết định đã chốt.
