# Toàn Invoice hiện hành — kiểm tra tiếp 04/11/2026

**Mốc PostgreSQL đã hoàn tất vẫn là [47 Invoice / 958 assertions](DGC_SOURCE_EVIDENCE_UNIFIED_20261104.md).** Kế hoạch mới có đủ 53 current Invoice candidates; chưa được gọi là financial admission, toàn sổ đã nhập hoặc cutover.

Lượt mở rộng 50 đã kiểm được lỗi ghi Invoice-57 và rollback, nhưng lượt bình thường exit 1 khi reader V4 gặp Invoice 57 có cả TOTAL_ONLY và CHILD_EXPANDED. Reader cũ yêu cầu mọi root đều có child, chỉ phù hợp bộ thử trước. Không đổi số tiền hoặc bỏ guard child-set: sửa reader để tổng đơn phải khớp nguyên source TOTAL, còn nhóm mở rộng phải đủ child/order/components theo replay. V4 vẫn phải có ít nhất một nhóm thực sự được cân bằng. 12 characterization checks đạt, gồm missing/changed/reordered/partial child sets. Query độc lập sau lỗi: Invoice/revenue/receipt/AR/cash 0, masters 37. Lượt 50 lỗi không được tính là completed.

Các phần đã có source checks, chưa thay thế PostgreSQL trial:

- Invoice 17: 15 checks, đúng hai group bị ảnh hưởng bởi owner financial links đã chốt, giữ physical REV0419 và missing legacy relation riêng.
- Invoice 57: 17 checks, current 57/archive 56 tách biệt; missing INV0064 của archive giữ nguyên, không suy successor.
- Invoice 38: 17 checks và [quyết định owner mới](DGC_INVOICE38_DOCUMENT_AUTHORITY_20261104.md), giữ CRBT sổ 3,28 / Recon 3,27 USD.
- Invoice 14/33: 17 source authority checks. Header/line/management của 14 giữ riêng, Paid/AR zero; ba child Draft của 33 không được promote.
- Invoice 43: 18 source checks, sổ/Invoice/PDF Recon khớp 2,78 / 0,28 / 2,51 USD; detail nguồn giữ 3,23 / 0,32 / 2,91 và native differences, không suy FX hoặc sửa source.
- Proposal cho 14/33/43: 24 checks; reader authority/detail capsules: 30 trên Windows và full Linux runtime.

Optional V5 chỉ nhận trusted Invoice-14 decision `ac4d3276...`, complete header/detail/AR/receipt source set, original PDF hash và exact component variance. Revenue detail V3 chỉ nhận source-360 capsule `0936ca7e...`, original Invoice/Recon concordance; native arithmetic không được gọi replayed hoặc accepted. V1–V4 cũ giữ nguyên gate.

Linux one-site runtime hiện thử tại `artifacts/single-site/20261104-current-ledger-candidate`, image `dgc-erp-current-ledger:20261104`. 222 reader checks đạt. Bộ PostgreSQL tiếp theo `current-ledger-unified-source.integration.mjs` chạy trên clone, kiểm 53 current Invoice cùng revenues, documents/links và source receipts; log tại `artifacts/dgc-migration/20261024/child-rounding/current-ledger-unified-source.integration.log`. Chỉ cập nhật mốc sau retained-log exit 0 và query sau rollback.

Thay đổi hiệu năng chỉ ghi nhớ phép dựng reference graph thuần trong một planning context, fingerprint toàn snapshot/decisions mỗi lần và trả bản sao. Không ghi nhớ kết quả đọc file/DB, không bỏ fresh-file/transaction checks. Scoped input mutation/output isolation 17 checks và graph regression đạt; bộ migration 45 suites đạt.

Draft/archive, 13 revenue rows ngoài current53, ba Input Recon Generated/no AP, cash-history/no balances, FX/danh mục bổ sung, full operational importer, source freeze/final snapshot, backup/restore và UAT vẫn phải xử lý trước cutover. Chưa financial import host hoặc manual host redeploy. Source/release mới chưa publish sau `2750215`/`bcc52fa`; toàn private source/store ở ignored artifacts.
