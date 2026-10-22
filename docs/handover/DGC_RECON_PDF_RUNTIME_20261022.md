# PDF đối soát gốc trong historical source adapter

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục [lớp đọc evidence](DGC_HISTORICAL_SOURCE_ADAPTER_20261022.md). Đã nối custody PDF vào runtime chỉ đọc; không import Attachment/Document/OutputReconUpload, không tạo approval hoặc financial record.

## Kết quả

Runtime filesystem reader đã đọc/kiểm SHA-256 đúng **261 PDF / 231.836.275 byte** từ kho gốc hiện có. **Năm file chưa capture trả 404**; không đoán source đã bị xóa hay đổi quyền, không thay bằng PDF tái tạo. Manifest vẫn incomplete. Không sửa/copy/regenerate originals hoặc đổi hash manifest.

Private proof: `artifacts/dgc-migration/20261022/recon-pdf-runtime/verification.json`. Manifest pin vẫn `110fc2d6021f9faae7d5ea430133ef74013ec97794faeefef0548636ed9ab48f`, snapshot pin `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`. Kiểm nguồn thật ở đợt này là component filesystem/hash/binding, **không phải 261 record đã nhập DB hoặc 261 HTTP requests qua tài khoản thật**.

## Luồng runtime

`readHistoricalRevenueSource` nay trả thêm document address (43_RECON_PDF_HEADER, physical row/hash) và file ID. Document này đã được kiểm với staged row; ID lấy từ Source_File_URL/hyperlink đã capture phải duy nhất và khớp metadata rehearsal. URL và hyperlink khác file ID hoặc metadata trỏ sai file đều giữ 409. Không chọn file theo tên, số tiền, trạng thái Approved hoặc dùng URL từ request.

`historical-recon-files.ts` đọc manifest ghim hash và kiểm source document address/file ID đúng với evidence adapter. Đọc file chỉ trong absolute root cấu hình; filename phải đúng `<fileId>.pdf`. Kiểm mime, kích thước, `%PDF-` và SHA-256 từ chính bytes đọc được. Không đọc trực tiếp Drive hoặc fetch URL trong manifest.

Hai API mới, cùng SYSTEM_CONFIG_EDIT/DGC/company UUID/snapshot pin như source evidence:

```text
GET /api/v1/dgc-migration/revenues/:id/source-pdf-info
GET /api/v1/dgc-migration/revenues/:id/source-pdf
```

Info cũng đọc/kiểm bytes trước khi trả `bytesVerified=true`, checksum, size, source document address và link tải theo Revenue UUID. Không trả raw title, source URL, file path/root hoặc raw source cells. Download kiểm lại toàn bộ source/manifest/bytes, trả nguyên bytes với tên cố định `historical-reconciliation.pdf`, dạng attachment, MIME application/pdf, nosniff và no-store. Không có POST/approve/activate.

Hash custody **không xác minh chữ ký, nội dung bảng tiền hoặc nghiệm thu tài chính**. PDF metadata luôn giữ `pdfSemanticsVerified=false`, `signedStatusVerified=false`, `operationalUseAllowed=false`, `postingAllowed=false`, `acceptance=false`, `historicalCashPosting=false`. `manifestComplete` là cờ đã capture trong manifest, không suy từ việc một file đọc được. API source-evidence cũ vẫn `originalPdfVerified=false` vì riêng lời gọi đó không đọc PDF; lời gọi info/download mới là nơi kiểm byte.

## Guard đường dẫn và trạng thái thiếu

Root phải absolute, không là symbolic link/junction. Manifest và PDF không được là symlink; file path không có `/`, `\`, traversal hoặc alias filename. Duplicate file IDs/source document rows bị từ chối ngay cả khi package được tự rehash. Bounded read qua file handle kiểm size/inode/device trước đọc và size sau đọc: manifest tối đa 16 MiB, PDF tối đa 64 MiB. Không tin size để đọc không giới hạn nếu file bị tăng giữa chừng.

Manifest partial vẫn cho đọc file đã có và bind đúng. File ID không có trong manifest trả 404; file được kê nhưng bytes thiếu/đổi/khác hash, sai source binding hoặc manifest pin khác trả 409. Thiếu cấu hình trả 503. Các trường root/company/file/snapshot từ query không được nhận. Không có fallback sang donor renderer hoặc GST assets.

## Cấu hình và kiểm tra

Giữ hai pin company/snapshot của source adapter và thêm:

```dotenv
DGC_RECON_EVIDENCE_ROOT=<absolute directory containing recon-files-manifest.json and PDFs>
DGC_RECON_EVIDENCE_MANIFEST_HASH=<manifest SHA-256>
```

Đã thêm biến trống vào `.env.example`, chưa cấu hình `.env` thật hoặc cấp quyền tài khoản thật. Chưa thêm UI hoặc mở reader cho Staff/Accountant bằng REVENUE_VIEW; staged evidence vẫn là dữ liệu technical review riêng.

- API TypeScript build đạt.
- **60 assertions mới**: bytes/checksum, partial/missing file, exact source binding, duplicate/self-rehashed manifest, size/magic/content tamper, traversal/root junction, HTTP permissions/company/config/no-store/nosniff/private-field filtering, không có POST và không nâng acceptance. Test đọc filesystem thật; HTTP auth/DB dùng doubles.
- **94 source-adapter assertions** (thêm hai guard file ID/hyperlink), **59 PostgreSQL assertions** (gồm materializer thật/replay/rollback), và **20 suite migration** đều đạt.
- Host Windows không cho tạo file symlink nếu thiếu privilege; hai file-symlink cases chạy trên POSIX, chưa chạy ở host này. Root junction/traversal guard đã chạy trên Windows. Reader vẫn kiểm lstat cho từng file; không xin hoặc thay quyền hệ điều hành để chạy test.
- Đã kiểm toàn bộ 261 originals bằng runtime reader và năm source IDs thiếu bằng đường trả 404. Không DB write trong kiểm originals. PostgreSQL fixture riêng vẫn rollback sạch; staging thật và financial imports giữ nguyên.

```powershell
pnpm --filter @erp/api build
pnpm --filter @erp/api test:historical-recon-files
pnpm --filter @erp/api test:historical-revenue-source
pnpm --filter @erp/api test:historical-revenue-source:integration
pnpm test:migration
```

Tiếp tục: operational historical provenance/acceptance riêng và snapshot mapping Invoice/Total scope IDs. Chỉ khi đủ gate mới diễn tập restore toàn chuỗi với original attachments và actor/date nguồn; không dựng upload APPROVED hoặc lấy bytesVerified thay cho business acceptance. Financial link proposals, SOA cutoff/timezone, file thiếu và real-user provisioning vẫn theo bàn giao.
