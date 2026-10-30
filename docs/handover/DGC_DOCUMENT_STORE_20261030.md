# Kho chứng từ chuẩn bị chuyển — 30/10/2026

Đã kiểm custody đầy đủ từ snapshot và ba manifest Invoice/Recon/reference rồi chuẩn bị **429 PDF / 414.169.145 bytes** trong kho private theo SHA-256. Gồm 91 Invoice, 261 Recon và 77 reference files. Mỗi file được đọc lại ở nguồn trước sao chép và toàn bộ 429 blob đích được đọc lại/kiểm size và hash; không sửa PDF hoặc đổi liên kết nguồn.

Manifest ghim snapshot và hash của cả ba manifest nguồn, giữ từng file ID cùng tập địa chỉ hàng nguồn và đường dẫn `blobs/<sha256>.pdf`. Không chứa mật khẩu/biến môi trường/đường tải có quyền truy cập. Script từ chối ghi đè kho đã tồn tại, nguồn thay đổi, file ID trùng nhưng bytes khác hoặc output ngoài artifacts; fingerprint toàn bộ đầu vào kiểm lại trước khi ghi manifest.

Verifier độc lập đọc lại manifest và toàn bộ blob từ đúng pin, kiểm inventory không có file thừa/thiếu và từ chối symlink. **Sáu guard assertions đạt**: sai pin bị chặn; file lạ bị chặn; đổi một byte ở bản sao đã chuẩn bị với cùng root/pin bị chặn; phục hồi rồi đọc lại toàn bộ thành công, manifest nguyên vẹn. Chứng từ nguồn không bị ghi. Proof private `artifacts/dgc-migration/20261030/document-store-guard-proof.json`.

Đã chạy verifier trên Linux: đủ 429 file/414.169.145 bytes và cùng manifest hash, không phụ thuộc đường dẫn Windows. Proof private `artifacts/dgc-migration/20261030/document-store-linux-proof.json`.

**Đây chưa phải kho đã chuyển lên host hoặc đầy đủ mọi chứng từ lịch sử.** Năm original Recon còn thiếu giữ nguyên trong manifest; không có reference file thiếu trong tập manifest hiện hành. Hai file legacy vừa tìm cho Invoice 4 giữ riêng ở hồ sơ đang review, chưa tự gán vào original Recon hay tự thêm graph bị mất. Các bản sao trong gói ký không được ghi là đã khôi phục original bytes.

Kho tại `artifacts/dgc-migration/20261030/document-store/`, manifest hash `77b26cd95b1f364dc056ac2b47d7aa379910378261cf886b70b8c40a3f063850`. Nội dung private không đưa vào Git/release. `hostUploadAllowed=false`, `financialAdmission=false`, `financialCommitAllowed=false`; custody không chứng minh authenticity, signed status hoặc financial acceptance. Bước uploader/registry/download UAT/backup trên host còn pending.
