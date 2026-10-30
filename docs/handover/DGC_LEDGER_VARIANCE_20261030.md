# Giữ riêng sổ và tổng chi tiết Invoice 14 — 30/10/2026

Adapter nguồn `invoice-ledger-authority.mjs` đã kiểm chứng quyết định owner cho hàng 14 / INV0020. Nó kiểm hash quyết định đã tin cậy, snapshot, toàn bộ tập Invoice/detail/AR/payment, năm liên kết revenue vật lý duy nhất và ba thành phần USD của từng dòng. Thay đổi quyết định rồi tự tính hash mới không được chấp nhận; đổi snapshot cũng không chuyển được quyết định này sang dữ liệu khác.

Kết quả nguồn đạt **27 assertions**. Header giữ Revenue 16.298,88 / WHT 1.629,89 / Payable 14.668,99 USD; đã thu 14.668,99, AR còn 0. Năm dòng chi tiết và revenue tương ứng cộng thành 16.298,89 / 1.629,90 / 14.669,00 USD, khớp quan sát PDF đã ghim trong quyết định. Cả ba chênh lệch giữ đúng 0,01 USD. Không tạo dòng điều chỉnh, AR mới hoặc thay đổi số nguồn.

Đây là kiểm chứng dữ liệu nguồn, **chưa phải financial admission hoặc PostgreSQL trial** cho Invoice 14. Adapter trả `readyToImport=false`, `operationalUseAllowed=false`, `originalPdfBytesVerified=false`; việc kiểm bytes phải do bước custody thực hiện riêng. Các hold về nhóm revenue/legacy Recon, reader tổng scope, importer vận hành và UAT còn nguyên. Không gọi quyết định owner hoặc projection này là chấp nhận toàn bộ chuỗi tài chính.

Review hash: `972b51264e4cf449efb1b29ccca2459f7c8395e3017fa254877cf02219c9edc0`. Proof private tại `artifacts/dgc-migration/20261030/invoice-ledger-authority/`. Mốc thử chung hoàn tất vẫn 43 Invoice; signed-copy 44 chạy trong container riêng giữ log/exit status, không tự xóa container khi mất kết nối.

Mã nguồn `ebf1133` và release một website `f4a635a` đã được đẩy lên kho DGC. Runtime 124 file khớp byte với bản Linux đã build/kiểm reader; gói 126 file không chứa donor records/secrets. Chưa thực hiện redeploy host hoặc nhập tài chính từ các commit này.
