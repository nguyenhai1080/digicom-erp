# Thử chung 44 Invoice với signed-copy evidence — 30/10/2026

**Đã đạt trên clone PostgreSQL/Linux: 44 Invoice–AR, 321 revenues, 39 documents, 57 registry links và 41 receipts trên 36 parent đầy đủ; 894 assertions, exit 0.** Thêm Paid Invoice nguồn hàng 44 / INV0050 qua profile riêng `SIGNED_PACKAGE_COPIES_V1`; tập cũ 43 được dựng lại và hash giữ nguyên khi không có option mới.

Lỗi chủ động khi ghi Invoice 44, chạy đầy đủ, đọc lại 34 Invoice arithmetic adapters/toàn bộ 321 revenues, replay không trùng và full rollback đều đạt. 43 cancellation guards chặn đúng tài liệu đã liên kết. Giữ nguyên 37 master links, không parent shells, local approval, cash posting hoặc financial commit. Query độc lập sau khi test kết thúc: Invoice/revenue/payment/AR/cash đều 0, master links 37.

Invoice 44 giữ kỳ 07/2026 theo quyết định owner. Cả năm bản sao Recon giữ chân trang 06/2026 và cảnh báo; không sửa PDF, không suy tỷ giá. MCA child giữ captured USD khác phép đổi từ native in trên PDF; CRBT giữ các native input khác nhau. `nativeIdentityAccepted=false`, không khẳng định actual PDF-author rounding policy. Năm original Recon vẫn thiếu, không gọi các bản sao trong APP0048 là khôi phục original bytes.

Giới hạn transaction vẫn 120 giây. Chỉ gộp yêu cầu kiểm child PDF có cùng đủ tám trường đầu vào trong cùng bước; không cache kết quả filesystem/DB. Các profile/hash/gate cũ không thay. Pure plans dựng lại trước transaction, bytes/text/renders và fingerprint kiểm lại bên trong. Các lần DB starting-up, symlink EEXIST, timeout/mất kết nối trước đó không được tính pass; chỉ lượt retained-container kết thúc exit 0 với proof đầy đủ được tính ở đây.

## Còn lại trước vận hành

Chín current Paid chưa nằm trong tập đã thử: **4, 14, 17, 24, 33, 38, 43, 54, 57**. Còn 10 receipts ngoài parent set; bảy Invoice dependencies giữ bảy referenced documents. Năm Draft/33 archive và các revenue không thuộc tập này vẫn phải giữ đầy đủ theo mục tiêu migration gốc.

[Invoice 14](DGC_LEDGER_VARIANCE_20261030.md) đã có source adapter 27 assertions nhưng chưa financial admission; [Invoice 4](DGC_LEGACY_RECON_EVIDENCE_20261030.md) có chứng từ mới, còn cần adapter cho missing graph/duplicated upload identity. [Kho 429 PDF](DGC_DOCUMENT_STORE_20261030.md) đã chuẩn bị/kiểm trên Windows và Linux, chưa upload host hoặc UAT download. Full operational importer, toàn sổ, đối chiếu/UAT/final frozen snapshot/backup và cutover vẫn pending. Không promote trial rows hoặc mở master/evidence/local staging importers cũ.

## Pin và proof

- Snapshot: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.
- Unified 44: `0246f4969917beef21beea29d67024b696c368702051a848899c70aa7e5d884d`.
- Registry: `d9176c10d27fc43834628d47bc82a104d0013ca19fdcb996e3173447121f32db`.
- Private proof: `artifacts/dgc-migration/20261029/signed-package-copies/unified-proof-1793343465969.json`, `retained-trial.log`, các unified plans và remaining worklist cùng thư mục. Container `dgc-signed-copy-trial-20261030` được giữ ở trạng thái exited 0 để kiểm tra.

45 migration suites, Linux reader 210, PostgreSQL hồi quy 173/native byte-input guard 69 và signed-copy source checks 24/19 đã đạt; fresh-copy byte guard 5 cũng đạt. Những kết quả này cùng trial 894 không thay thế nghiệp vụ được nghiệm thu trên host. Chưa manual redeploy host hoặc nhập tài chính từ checkpoint này.
