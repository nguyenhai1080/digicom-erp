# Gói lưu trữ bằng chứng Invoice lịch sử — 20/10/2026

Tiếp tục từ [kế hoạch lịch sử Invoice](DGC_INVOICE_HISTORY_20261020.md). Đã tạo và kiểm lại gói riêng cho **33 Invoice Superseded/Cancelled**, gồm 33 PDF gốc, **23.399.649 byte**. Không nhập Invoice/AR/payment, không ghi DB hoặc cash, không áp dụng ba mapping đang chờ owner.

## Nội dung và nhận dạng

Kho private Git ignored: `artifacts/dgc-migration/20261020/invoice-source-archive/`.

- `archive.json`: snapshot/history-plan/source-file-manifest digest, cờ posting/operationalImport/recompute/historicalCash/acceptance đều false và index theo từng hàng nguồn.
- `records/<archiveId>.json`: giữ nguyên entry đã kiểm từ history plan, gồm header/detail/AR/payment đã capture, cells/formulas/display, số tiền âm, source row/hash, revision pointers và các issues/unresolved dependencies. Không suy lại successor, sửa tiền hoặc nâng trạng thái đủ điều kiện.
- `pdf/<sha256>.pdf`: bản sao byte của PDF đã xác minh. Nếu hai hàng dùng cùng bytes, file vật lý được dùng chung theo SHA-256 nhưng hai entry vẫn độc lập.
- `COMPLETE.json`: dấu hoàn tất ghi file, bind archiveHash và số entry. Dấu này không phải phê duyệt nghiệp vụ hoặc bằng chứng chữ ký số.

archiveId = SHA-256 canonical của snapshotHash và source address (sheet/sheetId/sourceRow/legacyId/rowHash), không dùng số pháp lý hoặc legacy ID làm khóa duy nhất. Vì vậy cùng số Invoice vẫn giữ được các hàng riêng. Bản Superseded của `03/12/2022/DGC-INV` đã có trong kho, bản Paid hiện hành cùng số không bị kéo vào kho lịch sử hoặc gộp vào bản cũ.

Digest gói: `a5c1c1fd8be1a0d18b981d9cf83667a706e2195aa88bc8beb4772fef4e5acbc4`.

## Kiểm chứng và giới hạn

Creator/verifier kiểm lại snapshot, owner decisions, history plan bằng cách tính lại từ nguồn; kiểm cả manifest và bytes của toàn bộ 91 PDF nguồn, rồi đối chiếu 33 payload/PDF trong kho. Hash metadata tự khai không đủ để sửa tiền, phân loại hoặc liên kết rồi tự tính digest mới.

Không ghi đè file/thư mục đã có. Chạy lại cùng nội dung chỉ verify và trả replayed=true; kho hỏng hoặc dở dang bị từ chối, không tự sửa/xóa/điền nốt. PDF gốc vẫn ở thư mục nguồn riêng. Đích không được trùng, lồng vào hoặc chứa thư mục nguồn; kiểm đường dẫn vật lý trước tạo parent. CLI chỉ nhận đường dẫn kho trong artifacts của checkout, kể cả qua symlink/junction. Bên trong kho không chấp nhận symlink/junction, file lạ, thiếu COMPLETE hoặc sai checksum.

Đây là cơ chế không ghi đè của công cụ và phát hiện thay đổi, **không phải WORM hoặc chữ ký chứng thực**: người có quyền filesystem vẫn có thể sửa file; phải verify với snapshot/plan/manifest hoặc digest tin cậy độc lập trước sử dụng. Parser PDF/signature không được thay thế bởi kiểm header/SHA-256; 91 PDF đã được parse ở đợt lưu nguồn trước.

Tra cứu CLI chỉ đọc, yêu cầu archiveHash đã biết từ lần tạo/verify đáng tin cậy, kiểm toàn bộ bytes/payload trong kho trước trả index. Tìm chính xác số Invoice, mặc định 10 kết quả/trang, có total/page/pages. Không có lựa chọn phê duyệt hoặc đưa dữ liệu kho vào sổ.

## Kết quả đã chạy

- `pnpm test:migration` Node 22/pnpm 10: cả sáu suite đạt; **43 assertions mới** cho archive. Kiểm trùng số pháp lý, PDF dùng chung nhưng entry riêng, số âm, pointer thiếu, loại current/draft, replay không đổi mtime, phân trang, payload/PDF bị đổi, manifest bị tự rehash, path traversal, junction thực, file lạ, marker thiếu, partial destination và source PDF đổi bytes.
- Gói thực: create đạt, verifier độc lập đạt, 33 entries/33 PDFs, bytes như trên. Chạy creator lần hai trả replayed=true và mtime archive.json không đổi.
- Tra cứu thực: 33 hàng, 4 trang; trang 1 có 10, trang 4 có 3; tìm số pháp lý trùng trả đúng bản lịch sử riêng. Không thay snapshot hoặc các quyết định mapping.
- `git diff --check` đạt. Chỉ sửa công cụ Node và tài liệu; không thay schema/API/UI runtime nên không chạy lại build ứng dụng.

## Lệnh dùng lại

```powershell
node scripts/dgc-migration.mjs create-invoice-archive --snapshot artifacts/dgc-migration/20261019/prepared/snapshot.json --snapshot-hash 47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d --decisions artifacts/dgc-migration/20261019/owner-decisions.json --plan artifacts/dgc-migration/20261020/invoice-history-plan.json --manifest artifacts/dgc-migration/20261020/source-invoices/all-invoices-manifest.json --source-root artifacts/dgc-migration/20261020/source-invoices --root artifacts/dgc-migration/20261020/invoice-source-archive
```

Đổi command thành `verify-invoice-archive` với cùng tham số để tính lại và kiểm nguồn. Tra cứu:

```powershell
node scripts/dgc-migration.mjs list-invoice-archive --root artifacts/dgc-migration/20261020/invoice-source-archive --archive-hash a5c1c1fd8be1a0d18b981d9cf83667a706e2195aa88bc8beb4772fef4e5acbc4 --page 4
```

Có thể thêm `--invoice-number <số chính xác>`; kết quả không gộp các hàng trùng số. Không lấy archiveHash từ chính một kho chưa tin cậy để coi là đã kiểm nguồn.

Runtime tra cứu trong ứng dụng và model/importer evidence riêng vẫn chưa có. Trước migration tài chính cần thiết kế kho bền vững/backup/quyền đọc, giữ source identity, rehearsal replay/rollback trên staging riêng và xử lý ngoại lệ liên kết hiện hành. SOA cutoff/timezone/ba mapping lịch sử vẫn chờ quyết định; chưa deploy/push hoặc nhập financial records thật.
