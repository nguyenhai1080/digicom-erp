# Invoice 01/02/2026/DGC-INV: giữ sổ và hai PDF — 04/11/2026

Owner đã xác nhận giữ đúng sổ và hai PDF kèm cảnh báo. Quyết định áp dụng riêng source Invoice hàng 38 / INV0044, không suy sang hóa đơn khác.

| Thành phần | Sổ / PDF Invoice gốc | PDF đối soát CRBT gốc |
| --- | --- | --- |
| Kỳ CRBT | 01/2026 | 01/2026 |
| Revenue CRBT | 3,64 USD | 3,64 USD |
| WHT CRBT | 0,36 USD | 0,36 USD |
| Payable CRBT | 3,28 USD | 3,27 USD |

Tổng Invoice theo sổ và PDF gốc: Revenue 15.665,88 / WHT 1.566,58 / Payable-paid 14.099,31 USD, Paid, AR zero. Giữ nguyên các thành phần độc lập, không sửa 3,28 thành 3,27, không tạo thêm công nợ, điều chỉnh hoặc cash posting. Hai PDF và cảnh báo lệch 0,01 USD đều phải được giữ. Tỷ giá/native trong PDF là bằng chứng nguồn; không suy chính sách FX vận hành.

Đã kiểm bytes/hash, trích xuất text và xem render trực tiếp cả PDF Invoice và đối soát. PDF Invoice file `1Cl4cYX66XktZLg5b4SOLqa1-b5HSSQgf`; Recon CRBT `1O4LlRWd7l8s8CQ6H_O9Shg1dSD-DVWfi`. Các file gốc không bị sửa.

Hồ sơ private `artifacts/dgc-migration/20261104/document-review/invoice38-authority-proposal.json`, proposal hash `5fd1de4dbd6ddaa63213afcbfba15cd0678fc866f921b923a0195aacd227623b`, đã ghim snapshot, toàn header/detail/AR/payment, Revenue/legacy Recon/header/detail và hai PDF/render. Quyết định tại `invoice38-owner-decision.json`, hash `4c97038fdd4b259c876cca4fcfd3728869ea0ab7d6754ae1ea088122ba3d5544`.

Đây là quyết định thẩm quyền số liệu/chứng từ, chưa phải financial admission. Các hold khác, full import, đối chiếu, UAT, snapshot cuối, backup/restore và cutover vẫn giữ.
