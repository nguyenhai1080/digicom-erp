# Nguồn, định danh và quyết định chứng từ — 29/10/2026

Đã đọc lại đúng workbook donor `DGC_ERP_2026_PROD_RC1_CLONE`, ID `1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A`, qua Google Drive/Sheets, chỉ đọc. Đủ 25 bảng trong baseline, 3.154 hàng khớp toàn bộ row hash; không thêm/xóa/sửa, đổi header hoặc grid bounds. Báo cáo private `artifacts/dgc-migration/20261029/source-delta/report.json`, hash `ee044877f71de319592dae14bfa6e3c90ecd993c529b8f69bccc7071339da92c`.

Đây là multi-request read, **không phải frozen snapshot tại cutover**. Không sửa snapshot/decision cũ hoặc giả định nguồn đã ngừng ghi. Giữ timezone donor `America/Los_Angeles` làm evidence; timezone báo cáo đích vẫn là `Asia/Ho_Chi_Minh` đã được owner chốt.

## Quyết định đã xác thực

[Invoice 14](DGC_INVOICE14_OWNER_DECISION_20261025.md) và [Invoice 33/44](DGC_DOCUMENT_OWNER_DECISIONS_20261029.md) đã có owner approval riêng. `document-authority.mjs` kiểm trusted decision hashes, toàn source set của Invoice 14, physical rows của 33/44, package parent set, kỳ July, original Invoice/reference bytes và render của bản ký. Source test đạt 18 assertions; private review ở `artifacts/dgc-migration/20261029/document-authority/`.

Đây là kiểm lựa chọn thẩm quyền trường dữ liệu, **chưa phải adapter nhập tài chính**. Không mở hold khác, tạo approval, suy FX hoặc promote các trial rows.

## Trùng mã nguồn

`source-identity.mjs` có proposal riêng, 26 assertions. Dữ liệu thật có đúng một Revenue ID trùng: `REV0419`, hàng 123 và 369 của `40_MONTHLY_REVENUE`. Đề xuất local code theo physical row/hash giữ hai record riêng, còn captured legacy ID vẫn giữ nguyên để tra cứu. Chưa áp vào writer/reader hoặc DB.

- Legacy Recon `REC0414`, hàng 371 chỉ khớp business scope của revenue hàng 369.
- Revenue hàng 123 không có legacy Recon cùng scope trong snapshot; giữ trạng thái thiếu, không gắn hàng 371 hoặc tự tạo record thay thế. Ba mapping owner ngày 23/10 vẫn giữ hiệu lực, không hỏi lại.
- Số Invoice `03/12/2022/DGC-INV` trùng giữa hàng 56 (archive/Superseded, không current) và 57 (current/Paid). Proposal giữ legal number và archive riêng; không suy ra hàng 57 là successor của hàng 56. Billing/rounding/lifecycle holds còn phải kiểm riêng.

Private identity plan: `artifacts/dgc-migration/20261029/source-identity/plan.json`, hash `7358758abbd12d4a8a1907e4c753fe0bb809d57a9688909327c38000fe22b756`.

## Bản sao trong gói ký

APP0048 vẫn chỉ cung cấp bản sao năm Recon, không phải bytes của năm file gốc 404. Private package44 OCR manifest/proof đã kiểm lại PDF, render, text/TSV, tool evidence và 10 OCR passes khớp Payable quan sát. Giữ cảnh báo header July/footer June; lựa chọn kỳ July đã được owner xác nhận. Chưa dùng proof này để mở generic missing-file guard hoặc financial import.

Full-ledger scope không đổi: hoàn tất tài chính và đối chiếu → importer vận hành riêng → UAT/quyền người dùng → chốt nguồn cuối/backup/restore → cắt chuyển. Không lấy kết quả nguồn không đổi, technical proposal hay rollback trial làm operational acceptance.
