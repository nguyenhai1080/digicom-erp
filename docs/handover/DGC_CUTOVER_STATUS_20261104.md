# Trạng thái cắt chuyển DGC — 04/11/2026

**Chưa cắt chuyển.** Phạm vi owner đã chốt là nhập đầy đủ sổ lịch sử trước vận hành; không thay bằng số dư đầu kỳ hoặc chuyển lịch sử sang backfill.

| Hạng mục | Bằng chứng hoàn tất | Phần còn lại |
| --- | --- | --- |
| Môi trường | Một website/API DGC, PostgreSQL và storage riêng đã được thiết lập | Chưa kiểm lại phiên bản host trong lượt 04/11 |
| Danh mục và bản chụp nguồn | Host đã nhận 37 master links và 3.154 hàng/25 bảng bằng luồng riêng đã đóng | Nguồn chưa khóa cho cutover; phải chụp/đối chiếu cuối |
| Chứng từ | 429 PDF / 414.169.145 bytes trong kho private, đọc lại toàn bộ | Chưa upload/activate registry; năm original Recon vẫn thiếu |
| Sổ tài chính thử chung | 45 Invoice–AR, 329 revenues, 40 documents/58 links, 42 receipts; 920 assertions, full rollback/no cash | Tám Paid, chín receipts, Draft/archive và toàn bộ sổ chưa nghiệm thu/nhập thật |
| Invoice 01/04/2023 | Owner giữ sổ và hai PDF/cảnh báo; Revenue-only PostgreSQL 32; toàn Invoice 22 source checks; reader authority 11 | Đã trial trong set 45; chưa financial admission |
| Runtime/đóng gói mới | Linux build một website và 210 reader checks đạt; 45 migration suites đạt | Chưa công bố release mới hoặc xác nhận host đã chạy release |
| Vận hành | Không có tài chính nhập chính thức được xác nhận | Importer toàn sổ, đối chiếu đầy đủ, quyền người dùng/UAT, backup/restore và chốt cutover |

Số liệu 45 là kết quả thử trên clone, không phải dữ liệu tài chính đã nhập lên host. Tám Invoice công nợ mở đều nằm trong bộ thử; tổng 25.328,54 USD là số chụp nguồn, không phải số dư cutover đã khóa.

Quyết định Invoice 4 chỉ áp dụng đúng physical row 4 / INV0009 và hồ sơ owner đã ghim: giữ ngày 05/04/2023, hạn 20/05/2023, Revenue 18.644,15, WHT 1.864,42, Payable/paid 16.779,74 USD, AR 0. Bản ký giữ riêng sai khác ngày/hạn/Revenue; không sửa tiền/PDF hoặc dựng header RPD0039/detail RDL0089 không tồn tại. Xem [hồ sơ owner](DGC_INVOICE4_DOCUMENT_AUTHORITY_20261030.md).

Đường găng tiếp theo: giải quyết các Paid còn held và Draft/archive → importer toàn sổ cùng chứng từ → đối chiếu/UAT → snapshot cuối, backup/restore và cắt chuyển. Không chuyển trial rows sang vận hành hoặc mở lại các importer cũ.

## Các Paid ngoài mốc 45

| Hàng Invoice nguồn | Điểm cần xử lý tiếp |
| --- | --- |
| 14 | Adapter giữ riêng header/chi tiết/PDF đã có source checks; còn whole-parent PostgreSQL và các Recon holds |
| 17 | Mapping owner đã chốt; mã REV0419 trùng hàng 123/369, legacy cardinality và một số child/native/scope holds vẫn riêng |
| 24 | Printed/captured USD, native và consolidation cần giải thích đúng toàn parent |
| 33 | Owner giữ sổ/hai PDF đã chốt; source Draft children phải giữ Draft, chưa admission toàn parent |
| 38 | Native replay khác nguồn, chưa được giải thích bằng quyết định của Invoice khác |
| 43 | Invoice/monthly/printed Recon USD khác stale detail USD; phải giữ từng thành phần và nguồn của chúng |
| 54 | REV0419 hàng 369 khác scope hàng 123; còn child USD-link evidence, không gộp theo legacy ID |
| 57 | Cấu trúc/scope và số Invoice trùng một bản archive; không suy quan hệ kế nhiệm hoặc nhập hai current |

Không còn chờ owner trả lời cho Invoice 4/14/33/44, ba financial mappings hoặc SOA cutoff. Các quyết định đã chốt không tự giải phóng những hold khác trong bảng.
