# USD reference và thử chung 43 Invoice — 29/10/2026

Trên bản sao PostgreSQL của host, profile riêng thêm 12 Paid Invoice nguồn: **7, 8, 10, 12, 16, 18, 19, 30, 32, 36, 39, 40**. Không mở các gate cũ. Khi không có option mới, hash tập 31 giữ `e1626d1def6e937cf75d6082a50da79bc38faa42844e82999d14884ec2318f92`.

Kết quả thực tế: **43 Invoice–AR / 313 revenues / 36 documents / 38 registry links / 40 receipts trên 35 parent đầy đủ**, 862 assertions. Đọc 33 Invoice arithmetic adapters và toàn bộ 313 revenues; 37 guard hủy đúng, replay không trùng. Lỗi chủ động tại Invoice 40 và lượt hoàn chỉnh đều rollback sạch, toàn footprint/37 master links giữ nguyên; không cash, fake local approval, parent shells hoặc real-user provisioning.

Tập mới có 35 Paid và đủ tám Issued. Còn **10 Paid**, 11 receipts ngoài parent set, tám Invoice dependencies giữ 10 referenced documents; năm Draft/33 archive và phạm vi lịch sử khác vẫn riêng. Full financial import, UAT, snapshot cuối/backup và cutover chưa xong. **Không có financial commit hoặc thay đổi host từ trial này.**

## Nội dung profile

`usd-reference.mjs` kiểm lại bytes/text của toàn 261 original Recon và binding child review. 44/47 child differences có exact USD concordance hoặc exact source fallback + independent printed arithmetic compatibility; ba hàng 398/399/400 vẫn held. Không dùng tolerance, không sửa native/USD, không suy actual PDF-author policy hoặc operational FX/MZN. Một trường hợp giữ rõ printed-native conversion khác captured USD; không gọi USD là đã in trên child PDF.

`DGC_CAPTURED_NATIVE_IDENTITY_DIFFERENCE_V2` chỉ ghi sự khác biệt native của source bound, giữ `nativeIdentityAccepted=false`. Reader kiểm lại raw staged provenance và cả ba source USD conversions; V1 vẫn yêu cầu exact native identity, không bị nới. Mọi target trial vẫn BLOCKED/noncurrent, operationalUseAllowed=false.

Reader Invoice đã nhận đúng hồ sơ `financialLinkDecisions` owner chốt ngày 23/10, đặc biệt Invoice detail hàng 78 → revenue hàng 131. Envelope trong snapshot phải canonical và đúng trusted approval `a75b0238c43d73b8192fa1d26fdbb5bc99415266d75f4a3beb8c16833833d369`; kiểm snapshot/physical source/target/captured legacy value/Invoice parent/PDF checksum. Không chấp nhận self-consistent rehashed replacement, sửa legacy ID hoặc suy thêm mapping. Các guard tiền/scope/group vẫn chạy.

## Kiểm chứng và pin

- 45 migration suites đạt; Linux build một website và Linux reader **94 + 46 + 70 = 210** checks đạt.
- PostgreSQL unified cũ **173 assertions** hồi quy đạt. Owner document authority 18 và physical identity 26 checks riêng; chúng chưa tự mở financial admission.
- Full plans được dựng lại trước mỗi transaction; original bytes/text/renders và exact input fingerprint kiểm lại bên trong. Không cache filesystem/DB. Expected pins trong test chỉ là giá trị để đối chiếu, không thay cho verification.
- Lượt đầu phát hiện reader chưa nhận owner-approved link; đã sửa và chạy lại. Một lượt sau timeout subprocess đọc PDF, không được tính là pass; lượt cuối đủ 862 assertions mới là kết quả nêu trên.

Snapshot: `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`.

USD-reference review: `a6082718f2b4e1823f7f84ae5787269e7d9b216e563a420cbb4a144043bbb8f5`.

Unified 43 Invoice plan: `8216837bbab0432ff9784291337c384110a20ddfae4d7f0a37432d5edc45a62d`.

Registry plan: `7b4d228d256107a2fb0f4ea0c9f4dbd79d449cdbf839f48de1d14cfbbe8ee4af`.

Private proofs/worklist: `artifacts/dgc-migration/20261025/usd-reference/`. Source reread 29/10 khớp cả 3.154 hàng, xem [nguồn và định danh](DGC_SOURCE_AND_IDENTITY_20261029.md); chưa frozen. Bước tiếp theo ghép signed-copy Invoice 44 theo [owner decisions](DGC_DOCUMENT_OWNER_DECISIONS_20261029.md), rồi xử lý cả chín current Paid còn lại, hoàn thiện importer vận hành và UAT; không promote trial rows.
