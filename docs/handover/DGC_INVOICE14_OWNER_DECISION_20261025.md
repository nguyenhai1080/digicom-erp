# Invoice 01/02/2024/DGC-INV — quyết định owner

Ngày 25/10/2026, owner xác nhận: **“Đồng ý giữ số sổ 14.668,99 USD và PDF gốc”**. Không hỏi lại.

Áp dụng riêng source Invoice `INV0020`, `48_INVOICE_HEADER` hàng 14, snapshot `47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d`. Sổ Invoice/AR/khoản thu giữ 14.668,99 USD, Paid, dư 0; PDF gốc in 14.669,00 USD được giữ nguyên kèm cảnh báo đối chiếu. Không tạo công nợ 0,01 USD hoặc bút toán điều chỉnh, không tính lại/sửa tiền hay PDF nguồn.

Hồ sơ private `artifacts/dgc-migration/20261025/cutover/invoice14-owner-decision.json` ghim đầy đủ hàng Invoice/detail/AR/receipt, PDF bytes/text hash và proposal `49ae762baf3a2f7ca87aa3a709c00a566197285cd9eb3061433bbb65322a26e5`. Adapter phải xác thực lại các pin, giữ riêng ba thành phần sổ và ba thành phần PDF, không dùng tolerance để suy rộng ngoại lệ này sang Invoice khác.

Quyết định về thẩm quyền số sổ đã có; adapter/trial/import vận hành cho ngoại lệ này chưa hoàn tất. Các hold khác của Invoice/revenue/lifecycle vẫn giữ nguyên. Đây không phải financial commit, phê duyệt cục bộ hoặc cutover.
