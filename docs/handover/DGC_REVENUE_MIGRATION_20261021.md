# Chuẩn bị lớp doanh thu cho migration tài chính — 21/10/2026

Đã có `review-revenue` / `verify-revenue` để giữ và đối chiếu các cơ sở tiền doanh thu trước khi ánh xạ vào runtime. Đây là công cụ chuẩn bị chỉ đọc, chưa phải importer. Không ghi DB/staging, chạy generator, duyệt, sửa nguồn, gán quyền hoặc post cash.

## Kết quả trên snapshot thật

409 hàng `40_MONTHLY_REVENUE`: 406 Approved, 3 Draft; tất cả có Currency USD và có tham chiếu PDF nguồn. Giữ mọi hàng vật lý, kể cả hai hàng trùng một Revenue_ID.

| Trạng thái / loại / cờ nguồn | Hàng | Tính vào inventory tháng |
| --- | ---: | --- |
| Approved / Total / Y | 263 | Có |
| Approved / Child / N | 141 | Không |
| Draft / Child / N | 3 | Không |
| Approved / Total / N | 2 | Không; giữ cờ N để đối chiếu |

Inventory chia thành **52 nhóm kỳ/tiền tệ**, chỉ dùng 263 hàng Approved + TOTAL + Y. Không cộng thêm CHILD hoặc suy rằng mọi TOTAL đều phải đổi thành Y. Đây là tổng snapshot vật lý có provenance, chưa phải sổ hiện hành đã nghiệm thu; nhóm chứa hàng cần xem vẫn được giữ trong inventory, không âm thầm loại để làm sạch tổng.

**2.337 phép kiểm MATCH, 114 MISMATCH**:

- 111 phép so sánh Invoice payable với Invoice revenue − WHT lệch tối đa **0,01 USD**. Giữ chênh lệch chính xác, không đổi thành MATCH theo tolerance hoặc tự tính lại.
- Ba phép còn lại thuộc một hàng doanh thu so với ba cột USD trực tiếp của PDF detail đã capture: lệch tuyệt đối lần lượt **0,45 / 0,04 / 0,40 USD**. Đây là so sánh bảng nguồn, chưa phải đối chiếu trực tiếp PDF gốc cho hàng đó; chưa kết luận nguyên nhân hoặc sửa nguồn.
- Issue riêng: một hàng chưa resolve đủ source PDF/dependency, hai hàng trùng Revenue_ID, hai hàng Total/N không đúng tổ hợp canonical Total/Y hoặc Child/N. Các nhóm này có thể chồng nhau với mismatch; không cộng chúng thành số hàng riêng.

**294 STRUCTURALLY_PREPARED, 115 REVIEW_REQUIRED**. Cả 409 vẫn `readyToImport=false`. Không dùng 294 làm danh sách được phép ghi runtime: còn phải xác minh file gốc, mô hình đối soát/revenue đích, trạng thái/lịch sử và rehearsal replay/rollback.

Report private: `artifacts/dgc-migration/20261021/revenue-review.json`.

- snapshotHash: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.
- planHash: `55e5b7ce65aa42d48a7bc767789929e8dc9b583c15c54e8fcb92d78e8e704e84`.

## Quy tắc đã đọc từ donor và runtime

Donor `30_Revenue.js:createMonthlyRevenue` giữ Gross/Tax/Net/Partner_Share/Company_Share và ba số Invoice USD riêng; nhập tay dùng partner share = net × share rate. `importReconPdfToMonthlyRevenue` khoảng dòng 290–331 lại dùng payable USD làm management gross/net/company share, Share_Rate=1 nhưng Partner_Share=0, đồng thời giữ Invoice revenue/WHT/payable riêng. Vì vậy không áp công thức chia sẻ của nhập tay cho hàng có nguồn PDF.

`DGC_isRevenueIncludedInMonthlyTotal_` khoảng dòng 245–258 chỉ nhận TOTAL + Y; `60_Reports_Dashboard.js` còn yêu cầu đúng Status `Approved`, cộng Company_Share. Không chạy các hàm import/purge/backfill/repair donor. Hai tổ hợp Total/N thật được giữ và đánh dấu, không tự sửa để khớp mô hình canonical.

Đã đối chiếu runtime `recon-finalize.ts`, `revenue-money.ts`, `dashboard-summary.ts` và `manual-revenue.ts`: runtime có cả số management ở model và số Invoice/native trong calculationJson; không thể thay mọi số bằng một trường payable. Runtime Revenue còn cần Reconciliation/ReconciliationItem, logical group, revision và business scope. Report này giữ các cơ sở và binding nguồn, chưa tự dựng các bản ghi phụ hoặc đoán trạng thái đích từ Approved.

`revenue-review.mjs`:

- Giữ toàn bộ captured row/cell, source row/hash, status, period, service/partner/contract/parent/PDF binding và dependency vật lý. Không chọn hàng đầu theo ID trùng hoặc tạo UUID của target chưa nhập.
- Tách `capturedManagement` và `capturedInvoiceUsd`. Giữ Share_Rate; thuế hợp đồng hiện hành không thay số/rate lịch sử. Không suy FX giữa management currency và ba cột Invoice USD.
- So sánh Decimal chính xác: gross − tax = net; net − partner share = company share; Invoice revenue − WHT = payable; USD trên revenue với USD trực tiếp trên source detail. Không rounding khi so sánh. Số âm giữ nguyên và có issue; thiếu/sai không thành 0.
- Kiểm precision/scale để tránh PostgreSQL âm thầm làm tròn: management Decimal(20,4), Invoice Decimal(20,2), share Decimal(9,6). Đây là guard cho bước ánh xạ sau, không cho phép sửa source để vừa kiểu đích.
- Không chuyển MZN. Thiếu số USD trực tiếp là UNAVAILABLE, không gọi nhánh donor fallback MZN/FX. Với hàng không có PDF link, công thức manual chỉ là advisory, vẫn yêu cầu xác minh nguồn gốc; không tự kết luận đó là nhập tay.
- Giữ tổ hợp cờ không canonical; boolean mapping chỉ phản ánh Y/N đã có, không sinh mặc định. Status nguồn sai chữ hoa/thường không được nâng thành Approved để tính tổng.
- Tổng management chia theo kỳ/tiền tệ, tổng Invoice giữ nhãn USD riêng; trường thiếu làm tổng tương ứng null. Không trộn USD/VND/MZN hoặc cộng management với Invoice thành một số.
- Verify kiểm checksum và dựng lại report từ snapshot/quyết định, phát hiện cả thay nội dung rồi tính lại hash. Path đọc/ghi report được giới hạn vật lý trong artifacts private.

## Chạy và kiểm chứng

```powershell
node scripts/dgc-migration.mjs review-revenue --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --out artifacts/<revenue-review.json>
node scripts/dgc-migration.mjs verify-revenue --snapshot artifacts/<snapshot.json> --snapshot-hash <sha256> --decisions artifacts/<owner-decisions.json> --plan artifacts/<revenue-review.json>
pnpm test:migration
```

Chín suite migration đã đạt; suite doanh thu mở rộng cuối cùng đạt **86 assertions**: tiền management khác Invoice, TOTAL/Y và CHILD/N, Total/N bị loại, status exact, số trống/sai/âm/precision, direct USD thiếu không fallback MZN, master/dependency/parent/direction, ID trùng, nguồn gốc chưa rõ, tổng USD/VND tách biệt, determinism và rehashed tamper. Report thật đã chạy verify đạt. Chỉ thay migration scripts, không đổi ứng dụng/schema; không dùng build hoặc browser làm bằng chứng cho financial parity.

Tiếp theo là ánh xạ Reconciliation/ReconciliationItem/Revenue có provenance và bản PDF gốc cho các nhóm đủ nguồn, rồi importer có replay/rollback trên DB localhost `dgc_migration_staging_*`. Không vượt các ngoại lệ bằng cách gọi generator hiện tại, đổi cờ Total/N hoặc bỏ lịch sử. Ba InputRecon Generated vẫn chưa duyệt/không AP theo [bàn giao đầu vào](DGC_INPUT_FINANCE_MIGRATION_20261021.md). Các link proposal Invoice, SOA cutoff, timezone và role provisioning vẫn chưa được quyết định/hoàn tất. Không push/deploy hoặc sửa GST.

Đã tiếp tục [planner nhóm và diễn tập PostgreSQL có rollback bắt buộc](DGC_REVENUE_REHEARSAL_20261021.md): 169 nhóm/205 dòng đã ghi thử rồi replay/rollback trên DB phục hồi riêng. 204 dòng giữ theo cả nhóm; chưa phải importer commit. Đọc thêm characterization legacy Recon trộn MZN reference/USD và cách bảo toàn raw serial ngày trong tài liệu mới trước khi mở rộng ánh xạ.
