# DGC — child native OCR fallback and Paid Invoice trial

Cập nhật 24/10/2026, giờ Việt Nam. Tiếp tục worklist Paid Invoice sau native/Invoice USD profile. Đợt này giữ số in trên PDF và số donor đã lưu thành hai bằng chứng riêng; không sửa raw nguồn, áp dung sai hoặc mở import vận hành.

## Nguồn của sai lệch

Đã đọc lại donor deployed v61 `21_Recon_OCR.js:2020–2048`. Nhánh `legacy_column_major_formula_v85` lấy gross từng child, tính IVA từ tỷ lệ, chia phần sharing rồi tính remuneration/WHT/payable từ các intermediate chưa làm tròn. Các trường được làm tròn độc lập khi lưu; `DGC_round2_` dùng Number/Math.round với EPSILON. Donor có thể lưu native khác cột đã in. Đây là characterization, không phải thực thi lại donor hoặc khẳng định donor đã dùng đúng mọi dữ liệu.

`child-native.mjs` chỉ nhận tỷ lệ IVA in rõ ở cột `(4)` của PDF một trang, không dùng default 16%, suy tỷ lệ từ tiền hoặc đoán từ kỳ. Tất cả chín trường native phải hợp lệ, sharing/distribution rates đúng miền và bốn chữ số thập phân. Replay Number và Decimal phải đồng ý và tái hiện đủ chín trường đã chụp. Sáu cột đầu của printed row phải khớp nguồn. Ba cột tiền cuối phải khớp chính xác một trong hai phép tính staged Decimal HALF_UP/HALF_EVEN, không dùng tolerance.

`printedArithmeticCompatibility` là mô hình số học tương thích với ba giá trị in, **không chứng minh chính sách làm tròn hoặc phần mềm của bên tạo PDF**. Không chọn một chế độ giả định cho cả lịch sử. Mỗi child lưu cả components nguồn/in, delta, exact donor replay và các modes tương thích; `pdfAuthorRoundingPolicyProven=false`, `usdPrintedOnChild=false`. USD vẫn đối chiếu trực tiếp giữa captured detail/revenue và tổng USD của PDF như baseline, không suy FX.

Đã re-extract và kiểm lại bytes toàn bộ 261 PDF, đối chiếu lại parsed files/physical child links với pinned child review trong owner-decision envelope. Có 41 child native exceptions được characterize; sáu tiếp tục HELD. Hai dòng chưa giải thích được staged printed arithmetic, một dòng không khớp donor replay và ba dòng sai native/rate lớn không được tự sửa. Source rows, amounts, IDs, aliases, dates và approvals giữ nguyên.

Đã render/xem ba original Recon PDF của các candidate mới; header, kỳ, bảng child, tỷ lệ IVA, tổng USD và footer hiển thị đầy đủ. Render/text/proofs private trong `artifacts/dgc-migration/20261024/child-native/`; không publish dữ liệu/PDF đó.

## Profile Invoice riêng

`invoice-child-native.mjs` chỉ chọn original strict `RESTORE_HELD` có duy nhất `REVENUE_BUSINESS_OR_PDF_EVIDENCE_HELD`. Mọi group phải REHEARSABLE; evidence cũ phải clear hoặc có duy nhất child/native PDF hold vừa được characterize. Bất kỳ lifecycle, business, scope, captured finance hoặc USD-link hold khác vẫn chặn. Candidate nguồn: **13, 25, 42**, đều Paid. Profile không mở các Invoice có thêm rounding/structural/lifecycle holds.

`DGC_CHILD_NATIVE_FALLBACK_REHEARSAL_V1` giữ nguyên original reasons, source-bound child proof và flags không approval/posting. Extension `invoiceUnifiedNativePlan` chỉ thêm profile khi có `childNativeOptions` và plan pin được rederive từ originals; khi không có option này, kết quả/hash native-unified 18 Invoice trước đó giữ nguyên. Strict/V1–V4/unified gốc không đổi.

Trong writer, source group set phải đúng toàn bộ Invoice đã xác minh; original raw staging/master guards và replay/target hashes tiếp tục áp dụng. Invoice snapshot lưu/đọc kiểm đúng `childNativeEvidence`. Registry vẫn cần toàn bộ dependencies của mỗi tài liệu, receipts phải gắn full Invoice parents. Các target thử vẫn CANCELLED/BLOCKED, non-current, technical creator INACTIVE/no roles/session, transaction luôn rollback; không có đường commit hoặc cash posting.

Full graph/plan được rederive trước transaction. Trong transaction vẫn kiểm lại PDF bytes, OCR text/TSV/render, Invoice render, fresh child text/source binding và exact input fingerprint trước/sau; không cache filesystem/DB checks. Tách pure graph audit khỏi lúc giữ DB locks để tránh lặp việc nặng. Runtime transaction vẫn giới hạn 120 giây; harness synthetic có outer transaction 180 giây để chạy nhiều savepoint/failure cases, không thay staging guards.

## Kiểm đã đạt

Lượt source trial trên clone host đã đạt **381 assertions**: cùng một transaction ghi/đọc/replay/rollback **21 Invoice–AR / 139 revenue / 15 documents và 15 registry links / 16 receipts trên 15 full parents**. Có 14 cancellation guards được kiểm; không parent shells, cash hoặc local approvals. Giữ nguyên 37 master links và 3.191 raw rows; financial committed bằng 0. So với set 18: thêm ba Paid Invoice, 25 revenue, ba tài liệu và ba receipts.

Worklist còn 35 receipts ngoài eligible parents, 30 unique Invoice dependencies giữ 31 referenced documents; 30 Paid, hai Issued, năm Draft và 33 archive rows ngoài set mới. Các profile cũ và strict holds không bị xóa. Kết quả này không phải operational acceptance hoặc cutover.

- 44 unit assertions: complete fields/rate bounds, exact Number/Decimal source replay, independent printed models, amount/input drift, old strict holds và wrong review binding.
- 28 source assertions: 41 bound/sáu held, ba Paid candidates, source immutability và forged/rehashed child review bị từ chối sau fresh PDF extraction.
- 40 migration suites đạt trên Node 22, gồm hồi quy native-unified trước đó.
- 69 synthetic PostgreSQL assertions trên Linux: positive replay, AR/target/item failure, thay native render giữa transaction và thay input giữa transaction đều bị chặn; rollback toàn bộ. Bộ cũ trước mở rộng có 61 assertions.
- Hồi quy unified cũ trên Linux đạt 173 assertions, gồm registry/receipt mid-write failure và rollback.

Các lần chạy qua Windows có P1001 hoặc expired transaction; rollback giữ ledger rỗng. Đã chuyển kiểm PostgreSQL sang Node 22/Linux trong cùng network namespace với container DGC; chỉ DB `dgc_migration_staging_*` ở localhost nội bộ. Không restart Docker/GST hoặc tác động DB host. Test image thêm Python/pypdf 6.10.0, không chứa source financial records; raw evidence chỉ mount private lúc chạy, test containers tự xóa.

## Phần còn lại

Ưu tiên tiếp theo: 13 Paid entries trong V1 diagnostic có duy nhất `WHOLE_INVOICE_SOURCE_GROUPS_HELD`, và ba V2 entries có duy nhất `OTHER_INVOICE_SOURCE_SCOPE_OR_FINANCIAL_HOLD`. Cần kiểm phối hợp child/native evidence với captured USD rounding bằng profile riêng; đây chưa phải candidate đã xác minh. Không dùng profile ba Paid ở trên để bỏ business/rounding holds. Sáu child native held và các scope/lifecycle holds tiếp tục giữ riêng.

Chưa operational financial import/activation, real-user role provisioning, original files/registry migration, full reconciliation, SOA/UAT hoặc cutover. Hai Issued 85/86 và các Paid/Draft/archive khác còn worklist riêng. Không dùng số characterization/trial để báo financial acceptance. Host vẫn theo mốc v14; master/evidence/bootstrap/seed importers tiếp tục đóng. Thay đổi chỉ ở công cụ local; source development trên `dgc/main`, regenerate/test/publish `codex/dgc-deploy` cho một website, không deploy donor artifacts.
