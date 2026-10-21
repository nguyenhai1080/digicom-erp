# Chuẩn bị migration InputRecon/AP lịch sử — 21/10/2026

Đã bổ sung báo cáo chỉ đọc cho `56_INPUT_RECONCILIATION` và AP trong `50_AR_AP`, cùng kiểm tra PDF gốc. Đây là chuẩn bị bằng chứng và đường khôi phục; chưa phải importer hoặc nghiệm thu nghiệp vụ. Không ghi database, duyệt đối soát, tạo AP, sửa nguồn, nhập FX hoặc post cash.

## Kết quả snapshot thật

Snapshot đã ghim hash ngày 19/10 có **3 InputRecon, tất cả Generated; 0 AP**. Giữ cả ba ở trạng thái chưa duyệt, không gọi generator/approve hiện tại để tái tạo số lịch sử.

- **20 phép kiểm MATCH, 1 MISMATCH**; không có issue liên kết trên ba hàng này. Các dependency nguồn đều resolve được.
- Sai khác duy nhất là tiền nội tệ đã lưu cao hơn phép nhân số ngoại tệ × tỷ giá đã capture **0,5 VND**. Báo cáo giữ nguyên số nguồn và chênh lệch, không đổi thành MATCH hoặc sửa theo hợp đồng hiện hành.
- Cả ba hàng trỏ tới **cùng một PDF**. Đã tải bản gốc từ Drive, giữ nguyên bytes và gắn đủ ba row hash vào manifest; không nhân bản thành ba chứng từ riêng.
- PDF một trang, **75.497 bytes**; đã trích text, render bằng Poppler và xem ảnh. Số phải trả của cả ba dịch vụ đều khớp với snapshot. PDF dùng hiển thị làm tròn số nguyên; điều này không chứng minh nguyên nhân số nội tệ được lưu khác phép nhân 0,5 VND. Hàm tạo PDF donor chỉ cập nhật Attachment_URL/Status, không ghi lại số tiền.

Hash PDF: `b29babbbb237cb3a323e2ca3aee5cb71bd48be36044f0489b9fac2dcce45850b`.

Bằng chứng private, được Git ignore:

- `artifacts/dgc-migration/20261021/input-finance-review.json` — planHash `bc42a7b42de70d473297c0830d2f03eb8c43e449e0183388b22284b9d341b734`.
- `artifacts/dgc-migration/20261021/source-inputs/input-files-manifest.json` — manifestHash `bdbfd9f2ad1f8691d5a5eb6764dae7da610a256a18d20ba5150926547534b5fe`.
- Cùng thư mục có PDF gốc, text/ảnh render và `pdf-reconciliation-proof.json` ghi đối chiếu từng hàng.

Hash xác nhận bytes đã tải và liên kết với snapshot, không chứng minh file chưa từng thay đổi trước lúc tải hoặc tính xác thực chữ ký. Không tải nguyên bản tài liệu/record lên Git.

## Căn cứ donor và các guard

Đã đọc donor `53_InputRecon_AP.js`: generate (99–250), approve/AP (377–444), cơ sở doanh thu (450–576), tạo PDF (690–737) và phần hiển thị số nguyên/round0. Không thực thi donor.

`input-finance-review.mjs` dùng Decimal và thứ tự round2 của donor để **so sánh** từng giá trị đã capture: base × share, foreign × FX, local × tax/WHT, local − tax − WHT. Không ghi đè chuỗi số nguồn; thay thuế hợp đồng hiện tại không thay rate lịch sử. Chỉ đối chiếu cơ sở Invoice_*_USD trực tiếp có bằng chứng; nhánh MZN fallback/zero source được đánh dấu cần xem, không tự chuyển đổi MZN. Ô trống/sai định dạng không trở thành 0; số âm/overpayment vẫn giữ và có issue.

Generated/Draft phải có 0 AP hiện hành; Approved phải có đúng một AP được liên kết rõ. Kiểm partner/contract đầu vào, revenue nguồn, tiền tệ, Original/Paid/Outstanding và số lượng ứng viên. Không chọn hàng đầu khi có nhiều AP. Note donor tìm bằng substring, có thể nhầm ID là tiền tố của ID khác; công cụ kiểm tra dùng token `Input_Recon_ID=...` phân cách bằng dấu chấm phẩy và ghi mâu thuẫn, không sửa Note nguồn. AP đã trả khác 0 luôn cần đối chiếu thêm bằng chứng thanh toán.

Reference graph đã sửa ngữ cảnh: InputRecon → AP dùng partner/contract đầu vào; AP → revenue vẫn trỏ revenue đầu ra, không bắt partner/contract hai phía phải trùng. Fixture có hai phía khác nhau kiểm trường hợp này. Snapshot thật chưa có AP nên kết luận về AP chỉ dựa trên fixture tổng hợp, chưa phải nghiệm thu AP lịch sử thật.

Report giữ toàn bộ captured row, physical row/hash, dependency thiếu và AP candidate. Verify không chỉ kiểm checksum mà còn dựng lại report từ snapshot/quyết định để phát hiện sửa nội dung rồi tính lại hash. PDF verifier kiểm coverage theo file và theo row riêng, provenance/hash/size/header/path, cấm symlink file. Mọi kết quả giữ `postingAllowed=false`, `acceptance=false`; từng entry `readyToImport=false`, không recompute/cash posting.

## Chạy lại

```powershell
node scripts/dgc-migration.mjs review-input-finance --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<input-finance-review.json>
node scripts/dgc-migration.mjs verify-input-finance --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<input-finance-review.json>
node scripts/dgc-migration.mjs verify-input-files --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --manifest artifacts/<input-files-manifest.json> --root artifacts/<source-inputs>
pnpm test:migration
```

Output/report/manifest/root phải nằm trong `artifacts/` private. Lệnh verify-input-files chỉ kiểm file có sẵn, không tải Drive hoặc tạo manifest tự động. Manifest/proof thật được lập từ lần đọc nguồn này; không giữ download URL hoặc thông tin xác thực.

## Kiểm chứng và phần còn lại

Tám suite migration đạt, gồm **76 assertions InputRecon/AP** và **13 assertions PDF** mới. Bao phủ trạng thái/cardinality, hai phía hợp đồng, exact Note ID, tỷ lệ capture, thiếu/âm/sai tiền tệ, overpaid, tamper kể cả tính lại hash, shared PDF và containment. Verify report/PDF trên snapshot thật đạt. Verify kho 33 Invoice lịch sử sau sửa graph vẫn đạt, cùng archiveHash cũ. Không đổi ứng dụng/schema nên không chạy lại build/browser cho đợt scripts này.

Tiếp theo cần importer tài chính có replay/rollback và staging rehearsal riêng, giữ trạng thái Generated/số tiền/PDF nguồn, không tạo AP từ ba hàng trên. Chênh lệch 0,5 VND được giữ như exception có bằng chứng PDF, chưa có quyết định sửa. Các link proposal Invoice, SOA cutoff, timezone và full role provisioning vẫn chờ xử lý riêng. Chưa nhập financial record hoặc deploy/push.
