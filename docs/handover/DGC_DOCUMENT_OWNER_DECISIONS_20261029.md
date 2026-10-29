# Hai quyết định về chứng từ lịch sử — 29/10/2026

Owner đã xác nhận cả hai lựa chọn dưới đây. Không hỏi lại, không suy rộng sang chứng từ khác.

- Source Invoice hàng 33 / INV0039 / 01/09/2025/DGC-INV: **“Giữ đúng sổ; lưu cả hai PDF và cảnh báo”**. Ngày sổ 05/09/2025, hạn 18/09/2025, Revenue 17.064,56 USD, WHT 1.706,46 USD, Payable/đã thu 15.358,11 USD, dư 0. Giữ riêng original PDF và bản ký với các khác biệt về số/ngày/hạn/Revenue; không sửa PDF hoặc tự áp các trường trên bản ký vào sổ. Ba dòng con nguồn Draft vẫn giữ Draft, không tự duyệt từ trạng thái Total.
- Source Invoice hàng 44 / INV0050 / 01/08/2026/DGC-INV: **“Xác nhận kỳ 07/2026; giữ nguyên PDF và cảnh báo”**. Dùng kỳ sổ/Invoice/đầu trang tháng 07/2026, giữ mâu thuẫn chân trang tháng 06/2026 trên năm Recon trong gói APP0048. Không sửa file hoặc suy tỷ giá. Đây là bản sao trong gói ký, không phải đã khôi phục bytes của năm file gốc trả 404.

Hồ sơ private: `artifacts/dgc-migration/20261025/cutover/document-authority-owner-decision.json`. Proposal `b1280f0e5631b0dfff166ae34e6520bbf29623167fe773ef192c4f3f0398d4b1` ghim snapshot, các hàng nguồn, file/hash/render và quan sát. Adapter phải kiểm các pin trước ghi và kiểm bytes trong transaction; không cache filesystem/DB hoặc mở các gate cũ.

Quyết định đã có, adapter/trial cho hai ngoại lệ chưa hoàn tất. Các hold khác, financial acceptance, importer vận hành, UAT và cutover vẫn phải hoàn thành. Host chưa có financial commit từ các quyết định này.
