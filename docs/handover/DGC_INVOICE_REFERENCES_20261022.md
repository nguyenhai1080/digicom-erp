# Tham chiếu Invoice trong SOA và gói phê duyệt

Ngày 22/10/2026. Công cụ đọc snapshot, không sửa nguồn, nhập tài chính, cấp quyền, ghi registry hoặc chọn cutoff SOA.

## Quy tắc từ donor v61

- `40_Invoice_Core.js:1197–1232` kiểm toàn bộ SOA detail và approval package trước hủy. Không lọc bỏ SOA Draft hay package cũ theo trạng thái.
- `DGC_findInvoiceLinkedRowsV8119_` (1306) so sánh không phân biệt hoa/thường, trim; SOA khớp Invoice_ID **hoặc** Invoice_Number. Một số Invoice được dùng lại qua revision nên khớp số không đủ xác định duy nhất hàng nhập.
- `DGC_invoiceIdListContainsV8119_` (1290) tách package IDs bằng phẩy/chấm phẩy/xuống dòng, so sánh không phân biệt hoa/thường.
- `52_StateOfAccount.js:110–147` tạo header Draft cùng detail lưu cả ID và số Invoice. `41_Invoice_PDF.js:361–385` lưu danh sách Invoice gói stamp; package period là chu kỳ gói, không đồng nhất kỳ doanh thu Invoice.

Đây là mô tả guard nguồn; không sao chép hành vi donor xóa dòng/trash PDF. Target cancellation hiện giữ lịch sử/tài liệu theo quyết định đã ghi trong handover hủy Invoice.

## Thực hiện

`scripts/dgc-migration/invoice-references.mjs` giữ hai kết quả riêng:

- `donorBlockingTargets`: tất cả hàng Invoice khớp ID hoặc số theo đúng donor, kể cả nhiều revision. Không chọn bản đầu hoặc bỏ phụ thuộc khi context sai.
- `proposedTarget`: chỉ có khi từng selector đủ duy nhất, hợp nhất đúng một hàng, header tài liệu duy nhất và partner khớp. Missing/ambiguous/ID-number conflict/orphan header giữ `REFERENCE_HELD`. Package không áp kỳ doanh thu thay cho approval cycle.

Giữ canonical header/detail cùng địa chỉ vật lý, row hash, trạng thái/actor/date/cells nguồn. `verify` kiểm checksum và tái dẫn xuất toàn bộ từ snapshot; tự sửa report rồi băm lại vẫn bị từ chối. Documents không có Related_Invoice_IDs được ghi nhận riêng, không suy đoán liên kết bằng tiền/kỳ/revenue.

CLI (Node 22; output nằm trong ignored artifacts):

```text
pnpm migration:review-invoice-references --snapshot <snapshot.json> --snapshot-hash <pin> --out <private-review.json>
pnpm migration:verify-invoice-references --snapshot <snapshot.json> --snapshot-hash <pin> --review <private-review.json>
```

## Kết quả snapshot thật

- Snapshot pin: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.
- Review private: `artifacts/dgc-migration/20261022/invoice-references/review.json`.
- Review pin: `b18519f908ad6dcc6d8be9224bae6295e817a2849f1315ba37d23cceca8b1e56`.
- Ba SOA Draft/21 detail; 74 package (43 có Invoice, 31 không có danh sách Invoice).
- 64 tham chiếu tới 50 Invoice: 64 bound cấu trúc, 0 held; 46/77 tài liệu có tham chiếu.
- **Cả bốn candidate Invoice/AR rehearsal đều có tham chiếu nguồn.** Kết quả ghi thử trước chỉ chứng minh materializer/replay/rollback; chưa cho phép kích hoạt hay hủy Invoice vận hành.
- `registryWritesAllowed`, `acceptance`, `postingAllowed`, `filesVerified`, `soaCutoffSelected` đều false. `cancellationAllowed=false` trên mọi Invoice của report, kể cả chưa thấy tham chiếu; report này không chứng minh tất cả điều kiện hủy.

22 suite migration đạt, gồm 49 assertions mới: ID/number OR, case/whitespace/list parsing, Draft/Cancelled reference, duplicate revision number/ID/header, missing selector, partner conflict/missing, parent orphan, empty lists và rehashed tamper. CLI prepare/verify trên snapshot thật đạt. Không thay API/UI/schema/DB nên không chạy lại app build hoặc PostgreSQL trial trong đợt này.

## Phần còn lại

Cập nhật sau đợt này: [custody SOA/package](DGC_REFERENCE_FILES_20261022.md) đã lấy và kiểm bytes 77/77 PDF, backup/restore đạt. Nhận định chưa kiểm bytes bên dưới là thời điểm reference review ban đầu; target document lifecycle/registry vẫn chưa triển khai.

Chưa kiểm bytes PDF SOA/package, tạo target Document, promote file hoặc ghi InvoiceDocumentLink. `linkInvoiceDocuments` hiện yêu cầu target Document ACTIVE và Invoice current/operational; không dùng nó trực tiếp với SOA nguồn Draft hay các trial Invoice CANCELLED/non-current. Cần lớp historical document lifecycle và transactional mapping giữ nguyên guard nguồn, không tự coi Draft thành phát hành/approved. Sau đó mới rehearsal đăng ký đầy đủ tập Invoice/tài liệu và rollback, rồi tích hợp activation. Không mở cancellation của bản imported trước bước này; không cần chọn payment cutoff để giữ reference evidence.
