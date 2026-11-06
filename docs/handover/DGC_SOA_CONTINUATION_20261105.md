# Tiếp tục sau SOA v23 — 06/11/2026

SOA đã hoàn thiện, commit và triển khai v23; không còn mã WIP ở working tree. Xem DGC_SOA_RUNTIME_20261105.md và ../DGC_SOA_GUIDE.md. Source 18f3c1799a38efa6f6b8e9de33ce7f848a0deb32; release f2dc25b5723c79e05e705647406b1b2fb21abdc9. Windows/Linux 131 và hồi quy 64 đạt, UI giả lập preview/lưu/hủy đã kiểm. Backup DB trước/sau thành công.

Host xác minh ngày 06/11 qua phiên owner ở https://erp.digicomjsc.com/: SOA mới 0, đường đọc đối chiếu ngày chốt đọc đủ 53 Invoice và dư 25.328,54 USD. Không tạo hoặc ký tài liệu thật; không coi kiểm giả lập/đọc host là UAT của nhân viên. Không hỏi lại mappings/cutoff hoặc mở importer.

Tiếp theo theo roadmap: kiểm luồng đối soát đầu vào/phải trả và báo cáo, sau đó diễn tập restore backup sau chuyển trên môi trường riêng. Owner tự nhập lại October; không archive/import lại, không tự duyệt ba Input Recon Generated lịch sử hoặc lập Invoice/ghi thu trên sổ thật.
