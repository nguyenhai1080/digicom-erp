# PDF gốc SOA/gói phê duyệt và gate custody

Ngày 22/10/2026. Tiếp sau [rà tham chiếu Invoice](DGC_INVOICE_REFERENCES_20261022.md). Chỉ đọc Drive và lưu evidence private; không thay đổi nguồn, chia sẻ, vai trò, DB hoặc storage vận hành.

## Kết quả thật

- Đã lấy đủ **77/77 PDF**: ba SOA Draft và 74 package. Không có file thiếu hoặc document file selector mâu thuẫn trong snapshot này.
- Tổng **145.848.978 byte**. Đọc metadata trước khi tải raw PDF qua Google Drive, so MIME/ID/kích thước, kiểm PDF magic và SHA-256 tại máy. Không lưu URL tải có chữ ký vào records/manifest và không đổi PDF sang định dạng khác.
- 46 tài liệu có đủ structural reference binding + bytes để tiến tới rehearsal; 31 package không có Related_Invoice_IDs giữ riêng. Không suy thêm liên kết bằng kỳ/số tiền hay nội dung package.
- Đã kết hợp với 64 tham chiếu tới 50 Invoice; trạng thái nguồn Draft/Approved và địa chỉ vật lý vẫn giữ nguyên. Cả bốn Invoice candidate đợt trước có file của tài liệu tham chiếu đã được capture, nhưng chưa đủ điều kiện activation/cancellation.
- Backup gồm **160 entries**, ZIP **129.055.240 byte**; đã phục hồi vào thư mục mới và kiểm lại kích thước/hash của từng entry.

## Pins và private artifacts

Snapshot: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.

Kho local: `artifacts/dgc-migration/20261022/source-references/`:

| Artifact | Hash |
| --- | --- |
| `reference-file-plan.json` | `f0be84c590da1634ac41144cffd0b9e49999515730f9b44723f5b84fe3972a47` |
| `reference-files-manifest.json` | `4b5890a337483a0bdf76ec58a2ade554c39f3649d3cafe624e6f74f829c9c543` |
| `custody-review.json` | `21775aea2cc0d6e8ac3b4dbeaef824a8b62edc91aedb6e92c05ac3939c76a1b1` |

`verification.json` giữ kết quả byte verification; `records/` giữ metadata và checksum từng file. Backup/restore proof: `artifacts/dgc-migration/20261022/backup/reference-custody-backup-proof.json`. ZIP SHA-256: `77cdb8a5e3fb2fda3c070256db5c0c96f33ec667a8ed0df1f4892a814179db1f`.

## Công cụ và giới hạn

`scripts/dgc-migration/reference-files.mjs`:

- File plan bind cả ID, URL và hyperlink nguồn, phân biệt hai sheet dù trùng legacy ID/số hàng; giữ file dùng chung với đủ provenance. ID rõ ràng sai, nhiều ID khác nhau hoặc thiếu ID giữ review; không chọn URL cuối để che mâu thuẫn.
- Manifest verify yêu cầu snapshot/plan/manifest pins, exact source coverage cho từng file, metadata/path hợp lệ, tối đa 64 MiB/file và đọc có giới hạn qua file handle. Từ chối path escape, duplicate, root junction/symlink và checksum sai. Missing file được báo rõ, không tự đổi complete thành true.
- Custody review tái dẫn xuất Invoice references từ snapshot, ghim review hash, kiểm bytes rồi kết hợp theo địa chỉ source document. Một document có reference held giữ cả document held dù PDF có đủ bytes. Một Invoice có bất kỳ document dependency held vẫn giữ review. Không có tham chiếu được ghi rõ, không coi là đủ điều kiện hủy.
- Mọi `readyToRegister`, `registryWritesAllowed`, `postingAllowed`, `acceptance`, `sourceStatusPromoted`, `localApprovalCreated` đều false. Chưa phân tích nội dung PDF, xác minh chữ ký hoặc nghiệm thu số tiền; magic/checksum không chứng minh file đích đúng nội dung tài chính lịch sử tại thời điểm phát hành.

```text
pnpm migration:prepare-reference-files --snapshot <snapshot.json> --snapshot-hash <pin> --out <private-plan.json>
pnpm migration:verify-reference-files --snapshot <snapshot.json> --snapshot-hash <pin> --manifest <manifest.json> --manifest-hash <pin> --root <private-root> --out <private-verification.json>
pnpm migration:review-reference-custody --snapshot <snapshot.json> --snapshot-hash <pin> --review <invoice-reference-review.json> --review-hash <pin> --manifest <manifest.json> --manifest-hash <pin> --root <private-root> --out <private-custody-review.json>
```

23 suite migration đạt, gồm **52 assertions mới**: shared files/cross-sheet identity, source states, partial set, tampering/rehashed provenance, path/size/MIME/hash, root junction, selector conflicts, missing/invalid IDs, hyperlink label, reference mismatch và no activation/approval/cancellation. File symlink test chỉ chạy POSIX vì Windows chưa có quyền tạo file symlink; Windows root junction đã được kiểm. CLI verify/custody trên 77 file thật đạt. Không đổi API/UI/schema nên không chạy app build hoặc ghi DB ở đợt này.

## Bước kế tiếp

Cập nhật sau đợt custody: [registration planner và PostgreSQL synthetic rehearsal](DGC_REFERENCE_REGISTRATION_20261022.md) đã kiểm whole document set/replay/rollback/guard. Snapshot thật chưa có document candidate vì còn 46 unique Invoice blockers; production lifecycle/registry vẫn pending như phần dưới.

Chuẩn bị historical document lifecycle và rehearsal đăng ký nguyên tử toàn bộ tập Invoice của mỗi tài liệu trên DB riêng. Giữ SOA nguồn Draft là evidence có tác dụng chặn hủy, không tự đổi thành ACTIVE/đã phát hành để vượt `linkInvoiceDocuments`. Phải kiểm cả dependencies ngoài bốn candidate trước khi cho phép registration; không tạo partial package chỉ để trial một Invoice. Chưa promote file, tạo target Document/Attachment/InvoiceDocumentLink, chọn cutoff SOA, fake source approver hoặc mở financial import. Ba proposal tài chính, timezone/cutoff và môi trường DGC từ xa vẫn giữ nguyên pending.
