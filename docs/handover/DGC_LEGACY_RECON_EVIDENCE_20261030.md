# Chứng từ CRBT tháng 03/2023 — 30/10/2026

Đã đọc metadata và tải đúng hai file do nguồn dẫn chiếu cho Invoice hàng 4 / INV0009 / 01/04/2023/DGC-INV, revenue hàng 24 / REV0050 và legacy Recon REC0050. Không ghi Drive/Sheet hoặc sửa nguồn.

- PDF nguồn `DIGICOM_MAR_2023_CRBT.pdf`: 858.102 bytes, SHA-256 `38616a82235417d367067f3b16fe90a4f26e99853cc630435ce13c2ad27df35b`. Đã đọc text và render trang duy nhất: CRBT / March 2023, Revenue 55,87 / WHT 5,59 / Payable 50,28 USD khớp nguồn. FX 64,51 là giá trị in trong PDF, không tạo tỷ giá vận hành.
- Gói ký `2023-03-Invoice-Signed.pdf`: 4.593.733 bytes, SHA-256 `a192973c92293e83fc35cd09194b47a6cc80772be7b4f765d5278478dbdb2063`. Sáu trang scan; đã xem trang 1 (Invoice cùng số/kỳ, dòng CRBT cùng ba USD) và trang 5 (Recon CRBT cùng kỳ và số tiền). Trang 2/3/4/6 chưa được kiểm riêng; không coi toàn gói đã nghiệm thu.

**Điểm chặn thực tế là thiếu hàng graph, không chỉ thiếu URL:** RPD0039 và RDL0089 được revenue dẫn chiếu nhưng không có hàng tương ứng trong snapshot 43/44. Upload_ID REC0040 còn trùng ở hai hàng 16/17. Hàng 16 dẫn đúng file CRBT vừa tải nhưng metadata lại ghi April/MCAVM; hàng 17 dẫn file khác. Không tự chọn theo Upload_ID, sửa metadata hoặc tạo giả header/detail đã mất.

Bằng chứng mới cho phép xây adapter legacy Recon riêng dựa vào địa chỉ hàng vật lý, source-file link và bytes/text/render đã ghim. Nó chưa mở gate cũ hoặc thêm Invoice 4 vào tập PostgreSQL đã thử. Reader hiện hành yêu cầu header 43; cần adapter/writer/reader và rollback trial riêng trước financial admission. Không gọi file nguồn này là đã khôi phục hàng graph cũ.

Hồ sơ private: `artifacts/dgc-migration/20261030/invoice4-evidence/discovery.json`, hai PDF và ba render. Các đường tải có quyền truy cập không được lưu vào release; gói phát hành không chứa các file này. Full financial import/UAT/cutover vẫn pending.
