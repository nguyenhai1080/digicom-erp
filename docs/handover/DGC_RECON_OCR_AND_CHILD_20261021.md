# OCR bản scan và đối chiếu dòng con đối soát

Cập nhật 22/10: [đã đọc source lifecycle và audit replacement](DGC_RECON_GATES_20261022.md). Donor cố ý giữ revenue Approved khi đặt cờ tháng N và chuyển header/Recon sang Cancelled; hai chain snapshot khớp mẫu này. Không xem riêng status khác nhau là lỗi. Những chênh lệch số tiền và mapping/import đích vẫn chưa được nghiệm thu.

Ngày 21/10/2026, giờ Việt Nam. Tiếp nối [bảng tổng USD](DGC_RECON_SEMANTICS_20261021.md). Chỉ đọc snapshot/PDF private; không đổi nguồn, status, master mapping hoặc historical amounts.

## Sáu bản scan

Đã render và xem toàn bộ trang có sẵn của sáu PDF không có text layer. Chạy OCR **cục bộ**, Tesseract 5.3.0/Poppler 22.12.0, ảnh 300 DPI, tiếng Anh, hai chế độ phân trang PSM 3 và 6. Container không có network, thư mục originals mount read-only; không gửi PDF lên dịch vụ OCR bên ngoài. Giữ nguyên bytes PDF, không thêm text layer vào original.

Đã lưu SHA ảnh xem trực quan, ảnh OCR, text và TSV của từng pass; version/tool recipe và Docker image ID nằm trong manifest private ghim hash. Nhãn `CODEX_VISUAL_REVIEW` mô tả thao tác đọc ảnh của agent, không phải chữ ký hoặc phê duyệt của owner/kế toán.

- Payable USD quan sát trên ảnh khớp số đã capture ở cả sáu revenue Total. Cả 12 pass OCR đều đọc được duy nhất cùng số USD đó.
- Một bản scan thiếu phần đầu trang; chỉ thấy kỳ ở footer, chưa đủ nhận dạng toàn bộ tài liệu. Không tự dựng lại phần bị thiếu.
- Reader vẫn giữ năm trường hợp cần rà soát nhận dạng service/header hoặc phần đầu trang; trường hợp còn lại cũng chưa qua các gate nghiệp vụ.
- Các mẫu lịch sử chỉ in Payable USD không chứng minh Revenue/WHT USD. Reader giữ `invoiceRevenueUsdVerified=false`, `invoiceWhtUsdVerified=false`; không suy tỷ giá từ payable hoặc dùng MZN để điền cột USD còn thiếu.

`recon-ocr.mjs` kiểm pin riêng của OCR manifest, snapshot/source manifest, PDF SHA và physical header/hash; kiểm size/SHA của mọi artifact, path/symlink, hai pass đúng PSM, format observation và kỳ nguồn. OCR bất đồng hoặc nhiều USD candidates thì báo review, không chọn số đầu. Số tiền âm/định dạng không hỗ trợ không được đọc thành số dương. Bằng chứng đọc ảnh không tự mở import.

## Dòng con và các lớp số liệu nguồn

Đã đối chiếu đủ **144 physical Child revenue rows**:

| Kết quả | Hàng |
| --- | ---: |
| Chín ô detail in trên PDF khớp và ba khoản USD capture khớp liên kết revenue–detail | 94 |
| Có chênh lệch giữa native detail capture và ô in PDF | 47 |
| Chưa có bytes PDF | 3 |

Trong 47 hàng khác PDF, 44 hàng có chênh lệch không quá 0,01 **đơn vị native nguồn**; ba hàng còn lại có nhiều cột/rate lệch lớn. Không coi các chênh lệch native này là USD và không áp tolerance để biến chúng thành MATCH.

Ba hàng lệch nhiều thuộc một header Cancelled trong snapshot, trong khi các revenue liên quan vẫn ghi Approved và không tham gia tổng tháng. Có một header Approved khác cùng kỳ/service với bảng dòng in tương ứng khớp; hai PDF có **SHA khác nhau**. Điều này là bằng chứng cần rà soát vòng đời, chưa tự chứng minh quan hệ thay thế; không merge file, thay liên kết hoặc sửa Approved thành Cancelled.

Reader so từng child với `Service_Name` in trên chính tài liệu được header/detail trỏ tới; kiểm unique source, doc/upload, kỳ, service header và currency. Chỉ nhận hàng đủ bảy cột native và hai tỷ lệ, line number/child name không trùng và đúng thứ tự. Không chữa OCR xuống dòng hoặc đoán cột thiếu bằng tổng. Không so Child với tổng cả PDF.

MZN ở đây chỉ là evidence native trong donor. Ba khoản USD được so **trực tiếp giữa revenue và detail capture**, không quy đổi hoặc tính lại từ các ô native đã đọc. `usdPrintedOnChild=false`, `derivedUsd=false`: 94 hàng khớp chưa đồng nghĩa USD child đã được xác minh trực tiếp từ PDF hay được nghiệm thu tài chính.

Đã đọc `20_Recon_Core.js::DGC_resolveRevenueServiceId_`: donor ưu tiên tên dịch vụ con, bỏ qua mapping cũ bằng service cha; vì vậy không bắt `detail.Mapping_Service_ID == revenue.Service_ID` làm điều kiện match số in. Giữ cả hai mã và cờ `capturedIdsEqual` trong report để đối chiếu, không sửa master hay tự thêm alias. `30_Revenue.js::DGC_getRevenueAggregationFlag_` vẫn xác định Total/Y và Child/N; không đổi cờ tháng.

Trong 48 nhóm có child, hai nhóm REHEARSABLE và 13 nhóm HELD cũ khớp toàn bộ kiểm tra child của phạm vi này; 10 nhóm REHEARSABLE và 23 nhóm HELD cũ còn kiểm tra chưa khớp/thiếu. Mọi business HELD và lý do gốc được giữ nguyên, mọi `readyToImport=false`. Đây chưa phải kết quả xét eligibility tổng hợp với bảng tổng USD/lifecycle/Invoice/AR.

## Chạy lại và evidence

```powershell
node scripts/dgc-migration.mjs review-recon-lines --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --manifest artifacts/<source-manifest.json> --manifest-hash <sha256> --root artifacts/<source-recons> --python <python-executable> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --out artifacts/<child-review.json>
node scripts/dgc-migration.mjs review-recon-ocr --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --manifest artifacts/<source-manifest.json> --manifest-hash <sha256> --source-root artifacts/<source-recons> --ocr-manifest artifacts/<ocr-manifest.json> --ocr-manifest-hash <sha256> --root artifacts/<ocr-evidence> --out artifacts/<ocr-review.json>
pnpm test:migration
```

OCR CLI đọc evidence đã tạo và ghim hash, không tự chạy Docker/engine hoặc tạo observation. Path của input/output đi qua guard private artifacts. Chỉ có script generic và synthetic fixtures được đưa vào Git; originals, OCR text/TSV, ảnh và row/amount observations đều ignored.

Private reports:

- `artifacts/dgc-migration/20261021/recon-ocr/ocr-manifest.json`: `ade858130435ceb71e1f6f2e5cde61a4c5e43959f5f428eed1737db32ce8f036`.
- `artifacts/dgc-migration/20261021/recon-ocr/ocr-review.json`: `e4677ed42b49b63227400470dd3d07e27744a5d19bfda1ccfa1ba4e9d3e7df28`.
- `artifacts/dgc-migration/20261021/recon-semantics/child-review.json`: `caa079d7396dc7443a868c2f4780e1cae8501bad3d8f2690d59927c324ab8f65`, cùng snapshot/source manifest/target plan đã ghim ở đợt trước.
- `child-exception-observation.json` giữ source row/hash, các cột lệch, hai header/bytes khác nhau và SHA của hai ảnh đã xem trực quan.

Đã chạy CLI trên nguồn thật; report bảng tổng USD sau khi tách helper extraction replay giữ nguyên hash `1fb542e6d492c3d961718fead3f922f2325e322535afac33010feda80f454d7c`. Không đổi kết quả đợt trước hoặc gọi OCR để thay bảng tổng đã capture.

**14 suite migration đạt, gồm 45 assertions child và 35 assertions OCR mới.** Kiểm tra gồm parser, source identity, missing/zero, sai cột/rate, trùng dòng, mapping cha/con được bảo toàn, amount khác dù chỉ 0,01, pin/rehash tamper, path/provenance, đổi bytes OCR/PDF, partial scan và tách observed Payable khỏi Revenue/WHT. Không thay app/schema/DB, không nhập tài chính, push hoặc deploy.

Tiếp tục: hợp nhất các gate evidence theo nhóm, giữ riêng chuỗi Cancelled/Approved và các nguồn thay thế còn chưa có liên kết chắc chắn; kiểm với approval history/Invoice/payment trước khi chuẩn bị commit financial import. Sáu scan đã có bằng chứng đọc Payable, nhưng các phần USD/identity thiếu vẫn phải giữ pending; năm ID Drive chưa truy cập được không được bỏ khỏi inventory. SOA cutoff/timezone và các financial link proposals vẫn chờ owner theo bàn giao hiện hành.
