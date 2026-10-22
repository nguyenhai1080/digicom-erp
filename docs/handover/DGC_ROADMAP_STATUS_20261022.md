# Roadmap DGC Finance → DGC-ERP

Cập nhật 22/10/2026. Đây là bảng trạng thái hiện hành, đọc cùng START_HERE; các release/project-first và host GST trong `docs/LOCAL_GITHUB_VIBEHOST_ROADMAP.md` là lịch sử upstream, không phải kế hoạch triển khai DGC. Thứ tự kế thừa nghiệp vụ vẫn theo `docs/DGC_INHERITANCE_BASELINE.md`.

**Đang ở bước diễn tập migration tài chính địa phương. Chưa nhập chính thức bản ghi tài chính; chưa go-live.** Không dùng số test hoặc schema coverage làm tỷ lệ nghiệm thu nghiệp vụ.

| Chặng | Kết quả hiện có | Điều kiện còn lại |
| --- | --- | --- |
| 1. Tách DGC và chốt nguồn | Repository/branch DGC riêng; donor v61, snapshot 25 bảng/3.154 hàng ghim hash; USD/VND, mặc định USD | Remote, tài khoản host, DB/storage/secret staging DGC riêng chưa được cấp; timezone báo cáo chưa chốt |
| 2. Danh mục/hợp đồng | Đã nhập staging địa phương 10 dịch vụ, 4 đối tác, 9 hợp đồng, 14 liên kết; 37 provenance; đã áp dụng đúng quyết định owner về Movitel/thuế/alias | Nghiệm thu màn hình/quyền/dữ liệu đích toàn bộ trước vận hành |
| 3. Nghiệp vụ mới | Có runtime đối soát đầu ra → doanh thu → Invoice/AR/thu; DGC Invoice/PDF và ảnh ký ghép; đầu vào → duyệt → AP/PDF; kế toán nhập FX/chuẩn bị nháp | Nghiệm thu toàn chuỗi và full role parity; cấp quyền người dùng thật; không suy đã nghiệm thu từ build/test |
| 4. Migration tài chính — hiện tại | Đã ghi thử 169 nhóm/205 revenue rồi rollback; planner đủ 91 Invoice, bốn candidate Invoice/AR đã trial/replay/rollback; đã thu/kiểm 91 PDF Invoice và 261/266 PDF đối soát; đã rà 64 tham chiếu SOA/package tới 50 Invoice | Revenue còn 120/265 nhóm giữ review theo gate evidence kết hợp; Invoice 49 held, 33 archive riêng, năm nháp riêng; chưa nhận số liệu tài chính chính thức. Còn source actor/date, file promotion, reference registry, receipt lifecycle và nghiệm thu tổng tiền toàn chuỗi |
| 5. SOA/báo cáo/quản trị | Có công cụ đọc/so sánh cutoff SOA, màn/API lịch sử và mẫu quyền; registry guard cho tài liệu mới có sẵn | Chốt cutoff SOA, timezone; hoàn tất runtime SOA/reporting, UI/quyền và đối chiếu donor; không coi tool so sánh là SOA đã phát hành |
| 6. Staging nghiệp vụ → cutover | Có rehearsal/rollback địa phương và hồ sơ evidence | Full import staging + đối chiếu, UAT, backup DB/file và restore, chốt số dư tiền hiện tại; snapshot cuối/delta, thời điểm chuyển, môi trường DGC đúng tài khoản; sau đó mới go-live |

## Việc tiếp theo, theo thứ tự

1. Xử lý Invoice/revenue blockers của các whole document sets, giữ guard SOA Draft và Invoice cũ. [Đợt kiểm tham chiếu](DGC_INVOICE_REFERENCES_20261022.md) và [custody 77/77 PDF](DGC_REFERENCE_FILES_20261022.md) đã hoàn tất phần binding/byte custody; [registry synthetic rehearsal](DGC_REFERENCE_REGISTRATION_20261022.md) đã kiểm hai documents × hai Invoice, replay/rollback và guard runtime. Snapshot thật chưa có whole-document candidate: 46 documents có refs bị 46 Invoice held chặn; 31 package no-ref giữ riêng. Ưu tiên hàng chờ theo số documents bị ảnh hưởng; chưa ghi registry nguồn thật hoặc mở hủy/activation.
   [Đã characterize rounding nguồn](DGC_DONOR_ROUNDING_20261022.md): 21/46 Invoice blockers có chênh lệch USD truyền từ components độc lập được giải thích. [Đã ghi/đọc thử exception revenue](DGC_ROUNDING_EXCEPTION_REHEARSAL_20261022.md) cho 66 groups/105 rows snapshot thật, 73 metadata, runtime đọc/replay/rollback đạt; strict readiness vẫn giữ. Tiếp theo mapping ngoại lệ Invoice header/detail/AR, đồng thời giữ source/PDF/lifecycle gates, không sửa số tiền để ép identity.
2. Hoàn tất adapter vận hành lịch sử: actor/date riêng, current/revision, trạng thái và receipts không phát sinh tiền; tăng tập rehearsal chỉ khi gate nguồn đáp ứng. Không sửa số tiền cũ hoặc tái sinh PDF để vượt gate.
3. Đối chiếu tổng doanh thu, Invoice/AR/AP, receipts theo kỳ/đối tác/tiền tệ và kiểm toàn chuỗi qua UI/quyền trên staging. Import tài chính cần quy trình commit/replay/rollback được kiểm chứng, không đổi rehearsal thành lệnh ghi thật.
4. Hoàn tất SOA/reporting/roles và UAT; sau đó chuẩn bị môi trường DGC và cutover ở chặng 6. Projects tiếp tục sau nền nghiệp vụ DGC theo baseline, không thay thế luồng tài chính dịch vụ.

## Các quyết định/điều kiện vẫn mở

- Ba proposal liên kết tài chính đang chờ owner; chưa áp dụng. Các thiếu file, chênh lệch child/Total và nguồn revision vẫn giữ review theo từng nhóm, không tự coi là owner đã chấp nhận.
- Chính sách payment cutoff SOA và timezone báo cáo chưa xác nhận; không dùng timezone máy hoặc metadata workbook để tự chọn.
- Chưa cấp/gán đầy đủ Staff/Accountant/Manager/BOD thật. Quyền kế toán nhập FX đã được owner xác nhận, không hỏi lại.
- Connector host hiện là GST Vietnam; cần tài khoản/môi trường DGC riêng trước staging từ xa. Chưa push/deploy, không dùng dịch vụ GST thay thế.

Các phần độc lập vẫn tiếp tục được; không cần đợi các quyết định này để kiểm custody, mapping, rollback và tính đầy đủ của evidence. Thu lịch sử chỉ cập nhật Invoice/revenue/AR; không cộng số dư cash/bank. Chuyển động tiền mới chỉ vận hành sau historical imports và lập sổ tiền hiện tại.
