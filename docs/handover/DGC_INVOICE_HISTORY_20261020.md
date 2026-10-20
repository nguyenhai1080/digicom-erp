# Chuẩn bị migration lịch sử Invoice — 20/10/2026

Đã bổ sung `prepare-invoice-history`, `verify-invoice-history` và `verify-invoice-files`. Đây là công cụ chuẩn bị/kiểm chứng evidence; không có lệnh nhập Invoice/AR/payment, không mở guard tạo Invoice mới và không ghi DB. Staging chứa snapshot thật vẫn chỉ có master data như trước.

## Gói lịch sử theo từng hàng

Snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d` có 91 Invoice:

| Hướng xử lý đề xuất | Tổng | Qua kiểm tra cấu trúc | Cần đối chiếu cấu trúc |
| --- | ---: | ---: | ---: |
| Khôi phục Invoice hiện hành và công nợ | 53 | 49 | 4 |
| Khôi phục bản nháp chưa phát hành | 5 | 5 | 0 |
| Giữ lịch sử Superseded/Cancelled | 33 | 32 | 1 |

Qua kiểm tra cấu trúc **không có nghĩa đủ điều kiện nhập**. Gói vẫn giữ riêng các chênh lệch tiền từ financial review, yêu cầu master mapping, PDF gốc và rehearsal replay/rollback. `postingAllowed=false`, `recomputeAmounts=false`, `postHistoricalCash=false` cho mọi entry.

Gói private `artifacts/dgc-migration/20261020/invoice-history-plan.json`, digest `616a89a11cdad1a157bc9887908096586e3e626ff0f52b9c04c0621a9bcd4bd0`. Mỗi entry giữ header/detail/AR/payment nguyên gốc cùng sheet ID, row/hash, cells, trạng thái và business key/revision; liên kết revision và graph dependencies được kiểm riêng. Không đưa dữ liệu thật vào Git.

Kiểm tra gồm trùng invoice ID/number, nhiều current trong business key, revision number sai/trùng, trỏ thiếu/tự trỏ/vòng lặp, thứ tự và liên kết hai chiều, cross-business link, nguồn thiếu/mâu thuẫn. Không suy bản kế tiếp bằng revision lớn nhất. Dependency của bản cũ không tự chặn bản mới chỉ vì có revision link; mỗi bản kiểm các dòng và nguồn thực tế của mình.

`verify-invoice-history` tính lại từ snapshot/owner decisions, không chỉ kiểm digest tự khai. Thay số âm, disposition hoặc nguồn rồi tự tính lại digest vẫn bị từ chối.

## Phát hiện thêm và cách giữ lịch sử

Hai hàng 48_INVOICE_HEADER!56:57 cùng số `03/12/2022/DGC-INV`, nhưng là hai PDF và tổng tiền khác nhau: một bản MOVTV riêng đã Superseded, một bản tổng hợp hiện hành Paid. Đã kiểm trực quan cả hai PDF. Không gộp, đổi số hoặc dùng PDF này thay PDF kia.

Target `Invoice` hiện unique(companyId, invoiceNumber), nên không thể nhập cả hai như hai operational Invoice bình thường. Cần kho lịch sử immutable riêng cho bản đã thay thế, có source identity độc lập và giữ nguyên số pháp lý. Đây là hướng khôi phục đề xuất; model/runtime đọc kho lịch sử chưa được triển khai. Bản cũ còn trỏ successor không có trong snapshot; giữ nguyên pointer thiếu, không tự đổi sang bản Paid chỉ vì cùng số.

Dòng âm trên một Invoice Superseded được giữ trong captured payload và đánh dấu. Không đưa qua generator/issue endpoint mới, không tạo AR hiện hành hoặc tính lại tiền lịch sử.

## PDF gốc đã sao lưu

Đã dùng Google Drive connector đọc metadata rồi lấy raw file của **91/91 PDF**, tổng **36.483.892 byte**, 91 trang, 91 SHA-256 khác nhau. Không đổi sharing, folder, trash hoặc nội dung Drive. Tên file local là Drive ID nên các PDF cùng tên không ghi đè nhau.

Kho private `artifacts/dgc-migration/20261020/source-invoices/`; manifest `all-invoices-manifest.json` bind source row/hash, file ID, dung lượng, metadata modification time, local SHA-256. Manifest digest `dc7739817c07f064d2a5bc00d48a36e80eb94f3b18cdc02912bac796a1ab3f68`. Không lưu bearer download URL trong manifest/repository. Bản sao này là chứng cứ tại thời điểm đọc, không chứng minh file chưa từng đổi từ lúc snapshot hoặc chữ ký điện tử có giá trị xác thực.

- Đủ 91 file khớp dung lượng, có PDF header, parse được; verifier chạy lại kiểm bytes/SHA-256 và coverage/provenance từ snapshot.
- 90 file có lớp chữ; một bản scan Invoice tháng 08/2020 không có text. Đã render/xem bản scan và kiểm số Invoice, kỳ và ba số tiền khớp snapshot. Giữ scan nguyên gốc; nếu cần tìm kiếm nội dung phải có OCR riêng, không thay scan bằng PDF dựng lại.
- Đã render/xem 5 PDF liên quan các ngoại lệ và bản scan nêu trên. Chưa kiểm trực quan toàn bộ 91 trang; việc tải/parse/hash thành công không phải nghiệm thu nội dung từng file.
- PDF/PNG/text/private manifest được Git ignore. Không lấy logo/dấu/chữ ký trong các chứng từ này để thay tài sản ký của công ty trong runtime.

## Ba ánh xạ đang chờ owner

Đã chuẩn bị `artifacts/dgc-migration/20261020/financial-link-proposals.json`, proposal hash `c55e2c0c55a1559d7f071f45f8900c930299ed2adb61f6c95249f3fd79cf9055`, trạng thái PROPOSED_AWAITING_OWNER, chưa áp dụng:

1. Invoice `01/05/2024/DGC-INV`, dòng MEETME tháng 04/2024: 49_INVOICE_DETAIL!D73, REV0159 → đúng hàng revenue A123 (REV0419).
2. AR của Invoice trên, 50_AR_AP hàng 16: Revenue_ID → cùng hàng revenue A123.
3. Invoice `01/06/2024/DGC-INV`, dòng MEUCLIP tháng 05/2024: 49_INVOICE_DETAIL!D78, REV0419 → hàng revenue A131 (REV0167).

PDF gốc khớp dịch vụ/kỳ và số tiền của các hàng đích đề xuất; source doc/detail cũng khớp. Proposal bind snapshot, source row/hash, target row/hash và PDF SHA-256, không chỉ legacy ID vốn đang bị trùng. Đây là thay liên kết tài chính ngoài các quyết định master đã có nên đã gửi câu hỏi owner cụ thể. Không sửa Sheet hoặc tiền/ngày/PDF, không coi “làm tiếp” là xác nhận ba ánh xạ.

## Kiểm thử và lệnh

`pnpm test:migration` trên Node 22/pnpm 10 gồm core, reference, financial, history, file evidence fixtures. History kiểm phân loại, dòng âm/provenance, duplicate number, current/revision/cycle, dependency và rehashed tampering. File verifier kiểm manifest/source/hash, coverage, đường dẫn và file đổi bytes. Fixture giả lập checksum không khẳng định PDF hợp lệ; 91 PDF thực được parse riêng bằng pypdf, render ngoại lệ bằng Poppler.

```powershell
node scripts/dgc-migration.mjs prepare-invoice-history --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<invoice-history-plan.json>
node scripts/dgc-migration.mjs verify-invoice-history --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<invoice-history-plan.json>
node scripts/dgc-migration.mjs verify-invoice-files --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --manifest artifacts/<all-invoices-manifest.json> --root artifacts/<source-invoices>
```

Tiếp tục: quyết định ba liên kết và SOA cutoff, kho lịch sử immutable/runtime tra cứu, importer khôi phục số tiền và PDF thay vì generator mới, rehearsal trên staging riêng; giữ ngoại lệ revision và source thiếu. Chưa deploy/push hoặc tạo tài chính thật.
