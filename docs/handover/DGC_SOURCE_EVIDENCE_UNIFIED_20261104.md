# Định danh nguồn và scan USD — unified 47 — 04/11/2026

**Clone host/Linux đã exit 0, 958 assertions:** 47 Invoice–AR / 346 revenues / 41 documents / 59 registry links / 45 receipts trên 39 full parents. Injected Invoice-54 write failure, replay/full rollback đạt; không parent shells, local approval hoặc cash. Truy vấn độc lập sau test xác nhận finance 0/master links 37. Chưa nhập tài chính thật hoặc cắt chuyển.

Hai Invoice thêm là source 24 và 54. Optional profile `PHYSICAL_SOURCE_V1` phối hợp source identity `7358758a...`, full-USD observation `5ccca618...` của MEUPAR 11/2024 và USD-reference có sẵn. Không có option thì 45-set vẫn `63b7b2f15328db375cac1ee5ebd44849b99e24be31010011b22dc8f0deedcdc2`.

- `REV0419` hàng 123/369 có mã nội bộ khác nhau, giữ legacy ID. Legacy Recon hàng 371 chỉ khớp scope của 369; hàng 123 giữ thiếu legacy relation. Reader kiểm đủ hai physical sources và candidate source, bác rehashed forgery/hidden rows; 33 source + 34 PostgreSQL Revenue-only assertions.
- MEUPAR 11/2024: đã xem scan gốc một trang, đủ sáu USD components và footer khớp nguồn. Positive captured FX khớp số in nhưng không trở thành FX vận hành; native identity không được tự nhận accepted. Fresh PDF/render checks bác same-root byte tampering và rehashed observation, 7 assertions.
- Source proposal cho Invoice 24/54 đạt 16 checks. Full Linux single-site build/210 reader checks và 45 migration suites đạt trước phần mở rộng tiếp theo.

Private proof `artifacts/dgc-migration/20261104/source-evidence-unified/unified-proof-1793780000926.json`, log `artifacts/dgc-migration/20261024/child-rounding/source-evidence-unified-source.integration.log`, post-query `independent-post-trial-query.json`. Unified Invoice hash `87656087115d1ff333176f981df0d24186274b4d62c392688baa6c8e9f2cbd1c`; registry hash `57e51d002ccce7200999b887f81cfb2c383da4b22b237daef65ec303c3a0689c`. 36 Invoice readers, 346 revenue readers và 45 cancellation guards đạt.

Còn sáu Paid (14/17/33/38/43/57), sáu receipts, năm Invoice dependencies/năm referenced docs. Owner đã chốt Invoice 38, giữ sổ và hai PDF/cảnh báo. Invoice 17 có source proposal theo đúng ba link đã được duyệt; Invoice 57 giữ current/archive tách riêng và missing archive pointer. Các phương án này chưa được cộng vào mốc 47 nếu chưa có PostgreSQL exit 0.

Đang thực hiện bộ thử mở rộng các trường hợp owner/link/archive. Phần source mới cho Invoice 14/33/43 giữ header/line/management riêng, Draft children và stale detail/native values, chưa financial admission. Mã mới trong workspace chưa có source/release commit mới sau `2750215`/`bcc52fa`; chưa xác nhận host đã chạy release đó. Năm original Recon vẫn thiếu; kho private không vào Git/release. Draft/archive, toàn sổ, importer vận hành, UAT, snapshot cuối và backup/restore/cutover vẫn pending.
