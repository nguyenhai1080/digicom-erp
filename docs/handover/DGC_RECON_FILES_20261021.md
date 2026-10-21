# PDF đối soát nguồn và custody migration — 21/10/2026

Đã sao lưu nguyên bytes **261/266 PDF được header nguồn tham chiếu**, tổng **231.836.275 bytes**, giữ tên đích theo Drive ID và SHA-256 từng file. Năm Drive ID trả 404 ở hai lần đọc metadata; chưa phân biệt file không tồn tại với tài khoản kết nối không có quyền. Không thay bằng PDF khác hoặc coi là đã tải đủ. Không ghi DB, sửa Drive/Sheet/ACL, duyệt hoặc phát hành chứng từ.

## Kết quả và bằng chứng

`43_RECON_PDF_HEADER` có 266 hàng / 266 Drive ID riêng, không thiếu hoặc mâu thuẫn giữa Source_File_URL và hyperlink trong snapshot này. Đọc MIME/size/modified time trước raw fetch; 261 file đọc được đều application/pdf. Tải qua authenticated file reference của connector, kiểm size và đầu `%PDF-`, lưu file tạm rồi đổi tên, ghi checkpoint/hash từng bản; không ghi signed download URL/token vào artifact. Không có file partial còn lại.

Verifier đã kiểm lại đủ 261 file trên disk với manifest ghim hash: **integrityVerified=true, complete=false, missingFiles=5**. `pypdf` đọc được cấu trúc cả 261 file, mỗi file một trang, không mã hóa/cảnh báo parser. Đây là kiểm bytes và cấu trúc, chưa so nội dung/số tiền/kỳ/dịch vụ/chữ ký của tất cả PDF với snapshot. Không sửa, tái sinh, restamp hoặc chuyển đổi số MZN trong bản gốc.

Ghép với [kế hoạch rehearsal](DGC_REVENUE_REHEARSAL_20261021.md), giữ hai chiều kết quả riêng:

| Kết quả | Nhóm |
| --- | ---: |
| Bytes file capture khớp source binding | 259 |
| File tham chiếu nhưng chưa capture (404) | 5 |
| Source document còn chưa resolve | 1 |

Trong 169 nhóm / 205 revenue đã diễn tập, **166 nhóm / 202 revenue** có bytes nguồn để tiếp tục rà soát. Ba nhóm/ba revenue còn thiếu file. **96 nhóm / 204 revenue HELD vì nghiệp vụ vẫn giữ nguyên**; tải được file không tự giải quyết rounding, link, basis, lifecycle hoặc parent/child. Hai header nguồn không nằm trong nhóm revenue hiện tại vẫn được giữ file theo inventory.

Tất cả `readyToImport=false`, `postingAllowed=false`, `acceptance=false`, `pdfSemanticsVerified=false`. Chưa có financial import commit hoặc tài khoản/role thật được gán.

Artifacts private, Git ignore, tại `artifacts/dgc-migration/20261021/source-recons/`:

- `recon-file-plan.json` (266 source headers/file refs), hash `1ccc2ac43cb8c92b1ed091b327ce6d2b80b812fab0413ca4b498ea6fd4382271`.
- `drive-metadata.json`, thư mục `records/` và 261 `<DriveID>.pdf`: metadata đọc trước tải, thời điểm quan sát/tải, bytes/hash, từng physical row/hash. Record không chứa authenticated download reference.
- `recon-files-manifest.json`, hash **`110fc2d6021f9faae7d5ea430133ef74013ec97794faeefef0548636ed9ab48f`**; phần unavailable giữ đủ năm ID/hàng nguồn và lý do, không tạo hash giả cho file chưa có.
- `unavailable-source-files.json`: source row/hash/file name cho năm file chưa truy cập được. Đã tìm ID tương ứng trong kho artifacts cũ địa phương, chưa thấy bản sao để đối chiếu; không kết luận file đã bị xóa.
- `recon-files-verification.json` và `pdf-structure-proof.json` (proof hash `7c8335e183174d3d2807398bfd342abba6ac9b68bfc75a00097eb3395cd120fd`). Proof cấu trúc đã kiểm digest bằng JS canonical, không coi parser success là semantic acceptance.
- `../revenue-custody-review.json`, review hash `9fafeb0e5b971a81a57513d679d2bc8295833a58c7fef1604ecd4adc4d1015e6`.

Đã đóng gói backup local `artifacts/dgc-migration/20261021/backup/dgc-recon-custody-20261021.zip`: **533 entries, 233.098.664 bytes**, SHA-256 `3d87b669754a22a57a2bd1a58fa69dbe9c30e5c75e219b551246f5ec8147921f`. Gói gồm PDF/record/manifest/proof cùng snapshot, owner decisions và target/custody plan; không đưa .env hoặc download reference/token của connector vào gói. Đã phục hồi sang thư mục thử riêng, kiểm hash đủ 533 entries và chạy lại CLI với snapshot/manifest phục hồi: 261 PDF/231.836.275 bytes khớp, vẫn complete=false/thiếu năm file. Receipt và `restore-recon-verification.json` nằm cùng thư mục backup; bản restore tạm đã dọn sau kiểm chứng, zip/bản gốc còn giữ.

Đây là bytes hiện tại đọc từ ID đã capture, **không chứng minh file chưa từng đổi trước lúc tải hoặc snapshot là frozen**. Modified time chỉ là metadata quan sát. Không công bố raw records/PDF lên Git. Backup/rehearsal hiện cùng máy, chưa phải backup off-host hoặc bài restore DB + storage vận hành trước cutover.

## Công cụ và guard

`recon-files.mjs` tạo plan từ cả value và hyperlink của header, chỉ nhận Drive URL HTTPS đúng host hoặc raw ID. Giữ mọi hàng vật lý khi trùng legacy ID hoặc dùng chung file; không dùng số file thay số hàng. Nhiều file ID trong một header là CONFLICTING, không chọn bản đầu. Việc này không giải quyết mâu thuẫn upload/reference đã được graph nghiệp vụ giữ lại.

Verify đòi **expected manifest hash riêng**, snapshot/file-plan hash, metadata PDF, danh sách sourceHeaders/row hashes chính xác, size/header/SHA-256, path nằm trong evidence root và không phải symlink. Rehash manifest sau khi sửa nội dung không vượt được expected digest đã ghim. Manifest partial được kiểm những bytes có thật và trả complete=false/missing rõ; khai complete=true khi thiếu file bị từ chối.

`review-revenue-custody` dựng lại/verify target plan cùng owner decisions, kiểm manifest/file trên disk rồi nối bằng physical header/hash. Bytes đủ nhưng business HELD vẫn không eligible; header mâu thuẫn hoặc target file ID khác thì không được mở để review tiếp. `nextReviewPossible` chỉ nghĩa có thể tiếp tục rà soát, chưa phải quyền import hoặc phát hành chứng từ.

```powershell
node scripts/dgc-migration.mjs prepare-recon-files --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --out artifacts/<file-plan.json>
node scripts/dgc-migration.mjs verify-recon-files --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --manifest artifacts/<manifest.json> --manifest-hash <sha256> --root artifacts/<source-recons> --out artifacts/<file-verification.json>
node scripts/dgc-migration.mjs review-revenue-custody --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<revenue-target-plan.json> --manifest artifacts/<manifest.json> --manifest-hash <sha256> --root artifacts/<source-recons> --out artifacts/<custody-review.json>
pnpm test:migration
```

CLI chỉ tạo plan/verify/review file có sẵn; không tự dùng credential để tải Drive. Read/download của đợt này dùng Google Drive connector, record được checkpoint riêng, có thể tiếp tục từ manifest/source file inventory mà không thay file đã có. Output/root/manifest/plan qua CLI phải nằm vật lý trong artifacts private.

**11 suite migration đạt, gồm 60 assertions custody mới**: file chia sẻ nhiều source rows, expected digest, rehashed tamper, thiếu/partial/ambiguous refs, byte/size/MIME/path/provenance, header value/hyperlink và tách custody khỏi business eligibility. Plan CLI replay khớp hash; verify và custody review trên dữ liệu thật đạt với trạng thái partial đúng. Không đổi app/schema, không chạy lại browser hoặc DB rehearsal cho thay đổi file reader này.

Tiếp theo: đối chiếu nội dung PDF của nhóm đủ bytes, phục hồi/quyền đọc đúng cho năm file còn thiếu, xử lý ngoại lệ nhóm HELD và hoàn thiện lifecycle/revision/actor/date cùng Invoice/payment/AR trước khi mở commit. Các quyết định SOA cutoff/timezone và InputRecon Generated không duyệt vẫn giữ theo bàn giao trước. Không push/deploy hoặc sửa GST.
