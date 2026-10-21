# Đối chiếu bảng tổng USD của PDF đối soát nguồn

Ngày 21/10/2026, giờ Việt Nam. Tiếp nối [custody PDF](DGC_RECON_FILES_20261021.md) và [rehearsal revenue](DGC_REVENUE_REHEARSAL_20261021.md). Chỉ đọc originals/snapshot private; không nhập tài chính, sửa workbook, chạy donor hoặc phát hành lại PDF.

## Kết quả trên nguồn thật

Đã trích text layout từ toàn bộ **261 PDF đã lưu**, kiểm lại manifest/bytes trước và sau extraction. **255 PDF** có đúng một bảng tổng USD sáu cột, service/kỳ và footer đủ điều kiện đối chiếu. **Sáu PDF không có text layer đọc được**; không quy kết chúng thiếu nội dung, không đoán số từ snapshot để thay OCR. Năm file Drive chưa truy cập được vẫn nằm ngoài 261 originals này.

Đối chiếu 409 hàng revenue bằng physical row/hash:

| Kết quả | Hàng |
| --- | ---: |
| Ba khoản Invoice USD khớp chính xác bảng tổng PDF | 249 |
| Ba khoản Invoice USD có chênh lệch với bảng tổng | 4 |
| Child không được so với tổng cả tài liệu | 141 |
| PDF không có text đọc được | 6 |
| Chưa có bytes PDF | 8 |
| Chưa xác định duy nhất header nguồn | 1 |

Số hàng thiếu bytes khác số file vì một tài liệu có thể có nhiều hàng. Không dùng kết quả tổng để nghiệm thu các dòng con.

Trong 429 physical detail rows: 186 khớp đủ sáu cột USD tổng, 38 khác tổng, 182 không nhận dạng là dòng tổng của tài liệu, 13 chưa có text PDF, 9 thiếu bytes và 1 thiếu header duy nhất. Đây là đối chiếu các lớp nguồn, chưa kết luận detail nào là current/được phép thay thế. Dòng ghi superseded vẫn được giữ nguyên.

Overlay của **265 nhóm target**, không thay business state cũ:

| Tình trạng bảng tổng | REHEARSABLE theo cấu trúc cũ | HELD theo cấu trúc cũ |
| --- | ---: | ---: |
| Tổng khớp, còn các gate nghiệm thu khác | 147 | 57 |
| Tổng khớp, chưa kiểm child | 12 | 33 |
| Chưa kiểm đủ tổng | 9 | 3 |
| Có chênh lệch USD | 1 | 3 |

**Một nhóm từng diễn tập cấu trúc được nay có chênh lệch PDF, cần giữ để review thêm.** REHEARSABLE chỉ là khả năng thử ghi/rollback dữ liệu đã capture. Không phải eligibility import. Mọi nhóm/hàng vẫn `readyToImport=false`; report `postingAllowed=false`, `acceptance=false`, `pdfSemanticsVerified=false`.

## Ngoại lệ đã làm rõ thêm

- Ba chênh lệch trực tiếp revenue–detail của đợt review trước cùng thuộc một revenue row. Bảng tổng và footer PDF hiện có khớp ba khoản USD của revenue; cả detail cũ ghi “Reparsed and superseded” lẫn detail phân tích lại đều khác PDF. Không chuyển liên kết sang detail mới chỉ vì nó mới hơn và không lấy Note làm số tiền chính thức.
- Bốn revenue khác bảng tổng gồm hai trường hợp payable lệch đúng một cent và hai trường hợp có chênh lệch lớn hơn. Cả bốn PDF đã render và xem đầy đủ trang; summary/footer đọc được khớp ảnh. Chi tiết row/hash/amount nằm trong evidence private, chưa chọn sửa số nào.
- Trong 111 hàng có `Invoice_Payable_USD != Invoice_Revenue_USD − Invoice_WHT_USD`, **69 hàng vẫn khớp cả ba số in trong bảng tổng PDF**; 38 child chưa được so với tổng, 2 khác PDF và 2 thiếu bytes. Không thể coi toàn bộ 111 hàng là lỗi phép trừ cần tính lại. Đây là bằng chứng đặc trưng số gốc, chưa phải miễn gate đối chiếu.

Đã đọc donor v61 `21_Recon_OCR.js`: `DGC_amountToUsd_` chia và làm tròn từng khoản độc lập; `DGC_round2_` dùng Math.round/EPSILON. `reparseReconPdfDetailsFromRaw` đánh Note ở detail cũ rồi append detail mới, refresh header/summary; thao tác này không tự chứng minh chuỗi revenue đã được cập nhật nhất quán. `30_Revenue.js` giữ riêng ba khoản Invoice USD và management payable. Không thực thi bất kỳ hàm donor nào, không đổi historical amounts hoặc tính lại theo Tax_Rate đã duyệt cho master.

## Công cụ và replay

`recon-semantics.mjs` gọi helper Python/pypdf chỉ đọc, dùng original bytes đã xác minh và ghi nhận tool version/script hash, SHA của chính bytes đưa vào parser, text hash, summary line, nguồn physical row/hash và target plan hash. Không lưu text hoặc raw PDF vào Git. Helper lỗi thì báo chưa trích được, không điền zero.

Parser chỉ nhận đúng một trang, một dòng `In USD` đủ sáu số hai chữ số thập phân, một service, một kỳ và một footer DIGICOM USD. Phải khớp kỳ/footer, header service và kỳ trước khi so tiền. Không alias service, không lấy MZN/FX làm fallback, không áp tolerance, không chia tổng cho child. Phạm vi này chưa kiểm dòng chi tiết, số tiền bằng chữ, chữ ký, lifecycle hoặc lịch sử phiên bản Drive. Bytes hiện tại không chứng minh file đã frozen ở thời điểm snapshot.

```powershell
node scripts/dgc-migration.mjs review-recon-semantics --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --plan artifacts/<target-plan.json> --decisions artifacts/<owner-decisions.json> --manifest artifacts/<manifest.json> --manifest-hash <sha256> --root artifacts/<source-recons> --python <python-executable> --out artifacts/<summary-review.json>
pnpm test:migration
```

Snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; target plan `fd9d7dc0de5a59a2ef2d411f0c0c572a4ec614b0688e1c714676fa67cb928a22`; manifest `110fc2d6021f9faae7d5ea430133ef74013ec97794faeefef0548636ed9ab48f`.

Private output `artifacts/dgc-migration/20261021/recon-semantics/usd-summary-review.json`, review hash `1fb542e6d492c3d961718fead3f922f2325e322535afac33010feda80f454d7c`. `manual-observation.json` ghi năm PDF đã xem và SHA ảnh render; hash `eb856131f01fa5ef494c6d2e1e04500739dc72978913300819188aa04469104e`. Các JSON mới tái tạo từ originals; zip custody trước đó vẫn là backup đợt trước, chưa được thay bằng báo cáo mới.

**12 suite migration đạt**, gồm 32 assertions mới cho parser, amount equality chính xác, missing/zero, nhiều bảng, thiếu cột, currency/footer/period mâu thuẫn, child, giữ HELD và source hash thay đổi. CLI thực tế chạy trên 261 PDFs. Không đổi app/schema/DB, không push/deploy.

Tiếp tục: OCR có provenance cho sáu PDF không có text; đọc dòng con/bundle, đối chiếu các chênh lệch với vòng đời approval/Invoice/payment và source revisions. Giữ riêng các ngoại lệ cần owner quyết định sau khi có đủ evidence. SOA cutoff, reporting timezone, financial link proposals và provision role thật vẫn theo bàn giao hiện hành.
