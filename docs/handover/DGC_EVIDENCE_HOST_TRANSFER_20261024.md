# Kho nguồn trên DGC thật — 24/10/2026

## Kết quả thực tế

Đã dùng phiên ADMIN do owner đăng nhập để preview/rollback rồi apply nguyên gói nguồn lên `Digicom-Erp` / `dgc_erp_db`. V13 thực hiện chuyển nguồn; **v14 đã online và đóng importer**. Cả hai dùng release `f3661caec2bcf14ef3ee16e49afdd2524497a85f`, source `3e2567fe17e00ba65a95172a9c4514f939c2b068`, root Dockerfile, Node 22, port 3000; web/API chạy trong một website. Không tăng tài nguyên host.

- Kho nguồn mới đủ **3.154 hàng / 25 bảng**. Snapshot hash `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`; bundle pin `1bbdd0b77aa72a210010c2407e5c68ac5859f7e4783521523c85696eb4722895`.
- Giữ riêng 37 raw rows của master transfer: tổng raw 3.191, hai snapshot và 37 provenance links. Danh mục vẫn 10 dịch vụ, 4 đối tác, 9 hợp đồng, 14 liên kết.
- `/migration/evidence` đọc **91 Invoice nguồn**. Browser đã kiểm lần lượt cả 10 trang, mặc định 10 dòng/trang, trang cuối một dòng; tìm Invoice cũ ra đúng một kết quả. Hiển thị partner key và giữ trạng thái/số tiền/kỳ nguồn. Đây là màn đối chiếu nguồn, chưa là Invoice nghiệp vụ.
- **0 financial records**: chưa revenue, Invoice–AR, receipts, recon/InputRecon/AP, Document/registry hoặc tài khoản/bút toán thu chi. Không gán role thật, giả approver hoặc sửa source.

## Backup và khôi phục

Backup DB trước apply thành công (320 KB). Backup sau apply thành công (khoảng 1,3 MB), đã tải private và restore vào DB localhost mới `dgc_migration_staging_evidence_host_restore_synthetic`. Dump SHA256 `6d358e90a0ee5ed6795b541c11826a59870d3e56c56eb43d2d8df48336599651`.

**34 assertions đạt trên dump từ host thật**: toàn bộ 3.154 payload đọc/replay khớp gói ghim; replay tạo 0 và rollback; hai snapshot / 3.191 raw rows / 37 links giữ nguyên. 91 Invoice gồm Paid 45, Superseded 27, Cancelled 6, Issued 8, Draft 5. Cả 13 nhóm bảng tài chính/thu chi được kiểm đều 0. Chỉ restore/verify ở local, không restore đè DB host. Chưa nghiệm thu restore toàn bộ tài chính/PDF sau cutover.

Private proofs tại `artifacts/dgc-deploy/20261023/`: `dgc-evidence-restore-proof.json`, `dgc-post-evidence-host.dump`, các ảnh preview/last-page/pre-backup/post-backup/transfer-disabled và `v14-runtime.txt`. Không đưa dump, bundle, raw rows hoặc logs vào Git/release.

Ngoài 17 unit / 49 source / 63 HTTP assertions và 36 migration suites, đã chạy nguyên transfer nguồn thật trên Docker Node 22 giới hạn 512 MiB / 0,3 CPU: 23,327 giây, max RSS 359 MiB; rollback giữ đủ 37 raw rows cũ, không tạo tài chính.

## Importer đã đóng

V14 runtime trả `transferEnabled:false`, `available:true`, đủ 3.154 hàng / 25 bảng / 37 master links, `sourceValuesChanged:false`. Đã thử preview lại qua UI: trả “Chuyển kho nguồn DGC chưa bật.” Reader vẫn đọc 91 Invoice sau reload. Giữ `DGC_EVIDENCE_BUNDLE_HASH` để kiểm reader; `DGC_EVIDENCE_TRANSFER_ENABLED=false`. Master/seed/bootstrap tiếp tục false.

V14 có 25 migrations, không pending; health/root HTTP 200, database connected. Storage marker `330711dc-3bf0-452d-b703-a407e230074f`, tạo lúc `2026-10-23T09:59:10.583Z`, vẫn preserved qua redeploy.

## Công việc tiếp theo

Mốc cắt chuyển trong 23/10 **chưa đạt**. Kho nguồn đã chuyển thật nhưng operational financial import/UAT/cutover vẫn pending. Unified rollback trial hiện có 17 Invoice–AR, 113 revenue, 12 documents, 13 receipts; còn 34 Invoice dependencies / 34 referenced documents, 38 receipts ngoài candidate parent set, 31 package không có refs và các archive/draft riêng.

Tiếp tục historical multi-period/native scan evidence; importer vận hành/files/registry; đối chiếu tổng tiền; SOA cutoff/UAT/roles; snapshot cuối và backup trước go-live. Không dùng số test hoặc kho nguồn đầy đủ làm tỷ lệ hoàn thành nghiệp vụ.
