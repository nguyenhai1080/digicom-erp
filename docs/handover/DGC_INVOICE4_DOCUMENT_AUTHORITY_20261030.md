# Invoice 01/04/2023/DGC-INV: owner đã chốt giữ sổ — 30/10/2026

Đã xem trực tiếp PDF gốc một trang và trang Invoice trong gói ký sáu trang, kiểm bytes/hash và đối chiếu với sổ nguồn hàng 4 / INV0009. Đây là hóa đơn khác với các quyết định owner đã chốt cho hàng 14/33/44; không tự áp các quyết định đó sang đây.

| Trường | Sổ và PDF gốc | Bản ký |
| --- | --- | --- |
| Số Invoice | 01/04/2023/DGC-INV | 01/04/2023/DGC-INV |
| Ngày | 05/04/2023 | 14/04/2023 |
| Hạn thanh toán | 20/05/2023 | 29/05/2023 |
| Revenue | 18.644,15 USD | 18.644,16 USD |
| WHT | 1.864,42 USD | 1.864,42 USD |
| Payable | 16.779,74 USD | 16.779,74 USD |

Sổ đã thu đủ 16.779,74 USD, Paid, AR còn 0. Chênh 0,01 USD nằm ở Revenue MCAVM: sổ/PDF gốc 11.035,36, bản ký 11.035,37. Không sửa tiền để ép Revenue − WHT bằng Payable; captured components giữ riêng.

Owner đã xác nhận **giữ đúng các trường sổ, lưu cả hai PDF và cảnh báo**, không điều chỉnh tiền, tạo thêm AR, tính lại thu hoặc cash posting. Không hỏi lại và không áp sang Invoice khác. Quyết định chỉ chốt nguồn ngày/Revenue/PDF; các hold khác và financial admission vẫn giữ. Source-link Revenue CRBT đã có trial riêng một revenue/32 assertions/full rollback, không phải trial hoặc acceptance cho cả Invoice 4.

Proposal private ghim snapshot, toàn bộ header/detail/AR/payment, gói ký, bytes/text/render: `artifacts/dgc-migration/20261030/legacy-source-file/invoice4-document-authority-proposal.json`. PDF gốc SHA-256 `e08a648e9d47b1d3045c6789b5a1d6e1b3b4c1f5e509de4d2c44768ea0c474de`; bản ký `a192973c92293e83fc35cd09194b47a6cc80772be7b4f765d5278478dbdb2063`. Nguồn/PDF giữ nguyên; các hold khác, full importer/UAT/final snapshot/backup/cutover vẫn pending.

Decision envelope private `invoice4-owner-decision.json` cùng thư mục, ghim proposal `9a30ad8acc1eef8e5fa1ad0219a18ee60e163fe8e896f7bdf4f94736d56972c4` và giữ nguyên câu trả lời owner.

Cập nhật 04/11: [toàn Invoice đã trial trong set 45](DGC_LEGACY_SOURCE_INVOICE_UNIFIED_20261104.md), 920 assertions/rollback/no cash/37 masters. Chưa financial admission, importer vận hành hoặc cutover.
