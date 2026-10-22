# Truy nguyên chênh lệch làm tròn của donor

Ngày 22/10/2026. Tiếp sau [46 Invoice blockers của tài liệu](DGC_REFERENCE_REGISTRATION_20261022.md). Đây là characterization chỉ đọc; không chỉnh source/target, không đổi gate HELD, không nhập tài chính hoặc tạo bút toán điều chỉnh.

## Kết quả

Đã truy ngược ba cơ sở tiền độc lập của donor v61:

- `20_Recon_Core.js:449–475` lưu riêng từng cột native và gọi `DGC_amountToUsd_` độc lập cho mỗi cột.
- `21_Recon_OCR.js:1531–1540` chia từng native amount cho captured rate, rồi `Math.round((value + Number.EPSILON) * 100) / 100`.
- `30_Revenue.js:290–323` giữ riêng Revenue USD, WHT USD và Payable USD; management gross/net/company share lấy Payable USD. Không định nghĩa lại Payable bằng phép trừ hai số USD đã làm tròn.

`donor-rounding.mjs` transcribe công thức characterization có guard, không nạp/execute donor source. MZN/rate trong phép replay chỉ là evidence nguồn; không tạo operational MZN/FX, không tính lại số lịch sử để ghi đè. Blank/zero rate và native thiếu/sai không được biến thành 0 như fallback cũ.

### Doanh thu: 409 hàng

111 phép `Invoice_Payable_USD != Invoice_Revenue_USD − Invoice_WHT_USD` trước đây đều lệch đúng ±0,01 USD. **Cả 111** tái hiện được đầy đủ ba số USD trên detail bằng Number arithmetic của donor và captured native/rate. Đây là sự phù hợp với recipe nguồn, không chứng minh tính xác thực hoặc thời điểm rate đã được dùng khi phát hành.

| Phân loại | Hàng | Ý nghĩa |
| --- | ---: | --- |
| Captured USD identity khớp | 298 | Không có chênh lệch phép trừ USD; các gate khác vẫn độc lập |
| Independent rounding được characterize, các source check liên quan đạt | 92 | Native identity khớp, ba replay/detail/revenue USD khớp; không tự sửa Payable |
| Donor replay khớp nhưng native identity khác | 17 | Native Payable khác native Revenue − WHT; vẫn giữ review nguồn |
| USD identity khác và còn check khác | 2 | Một hàng lệch USD trực tiếp với detail; một Total/N không canonical, không trộn vào nhóm đã giải thích đầy đủ |

94/111 hàng có native identity khớp; hai trong 94 còn check khác nên chỉ 92 vào nhóm characterization đầy đủ. 17 native differences được giữ riêng: bảy +0,01, chín −0,01 và một +0,02 **đơn vị native**, không gán nhãn USD hoặc tự write-off.

Không có Number/Decimal discrepancy trên các component replay của snapshot này. Fixture `10.075 / 1` cố ý chứng minh donor Number ra 10.07 trong khi Decimal half-up ra 10.08; không mặc định thay Number bằng Decimal là luôn bảo toàn kết quả nguồn.

### Invoice: 91 hàng, rồi nối với 46 blockers

Invoice characterization yêu cầu header/detail sums, receipts/AR checks còn lại khớp, từng detail trỏ đúng physical revenue và ba USD trên line khớp nguồn. Chỉ ghi nhận propagation nếu tổng **chênh lệch từng dòng** bằng đúng chênh lệch header, không dùng tolerance.

| Trạng thái | Toàn bộ 91 Invoice | Trong 46 Invoice blocker |
| --- | ---: | ---: |
| Header identity khớp | 61 | 18 |
| Chênh lệch component rounding truyền nguyên vẹn lên header | 23 | **21** |
| Header/detail/ledger/source vẫn cần review | 7 | 7 |

21 trường hợp được giải thích là tiến triển về bằng chứng số liệu, **không phải 21 Invoice đã được mở import**. Gate nguồn đối soát/PDF, lifecycle/scope và financial acceptance chưa đổi. Header identity khớp cũng không có nghĩa các check khác hoặc whole document set đã đạt.

## Artifacts và chạy lại

Private folder: `artifacts/dgc-migration/20261022/donor-rounding/`.

- `review.json`, pin `2c299435c89fd73f256a15eb7ac6144b980e8469abae51315d9fe6bdc8c069fa`.
- `impact.json`, pin `b056d8fe26986025d796dc5d893564cbf1630a261d888b044d8add158ceea193`.
- Source snapshot pin giữ `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; registration input pin giữ `01286093f39907abe9dddaab22eea2bb179fe6f5de79849f1c396aa5d95ccfda`.

Report giữ physical header/detail/revenue/Invoice addresses + row hash, captured values, Number/Decimal replay, exact deltas và original issues. Impact pin cả report lẫn registration plan, kiểm mọi source address, giữ original restore reasons và affected documents. Không loại blocker chỉ vì đã hiểu cách làm tròn.

```text
pnpm migration:review-donor-rounding --snapshot <snapshot.json> --snapshot-hash <pin> --decisions <decisions.json> --out <private-review.json>
pnpm migration:verify-donor-rounding --snapshot <snapshot.json> --snapshot-hash <pin> --decisions <decisions.json> --review <private-review.json> --review-hash <pin>
pnpm migration:review-rounding-impact --snapshot <snapshot.json> --snapshot-hash <pin> --decisions <decisions.json> --review <private-review.json> --review-hash <pin> --registration-plan <private-plan.json> --registration-plan-hash <pin> --out <private-impact.json>
```

**25 suite migration đạt**, gồm **57 assertions mới**: known donor versus Decimal boundary, independent rounding, native mismatch, zero/missing inputs, direct USD difference, header sum/payment/AR preservation, missing source link, unsupported currency, immutable source, pinned/rehashed tamper và physical blocker binding. CLI verify report và tạo impact thật đạt. Không đổi API/UI/schema/DB, không chạy lại PostgreSQL/app build; đây không phải diễn tập ghi thêm financial records.

## Tiếp theo

Chuẩn bị cách ánh xạ ngoại lệ lịch sử giữ ba captured components độc lập và source provenance; không bắt kế toán sửa Payable để ép khớp Revenue − WHT. Trước khi đưa ngoại lệ vào rehearsal/import phải giữ riêng acceptance của source PDF/lifecycle/scope và kiểm header/detail/current AR/receipts toàn chuỗi. Với 17 native differences và hai source-check exceptions, tiếp tục truy nguyên từng hồ sơ; không áp dung sai đại trà. Scan chỉ có Payable USD vẫn không chứng minh Revenue/WHT USD; không suy hai số thiếu từ native/rate để đổi PDF gate thành đạt. Owner proposals/cutoff/timezone/roles vẫn pending như roadmap.
