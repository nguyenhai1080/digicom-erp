# Lớp đọc bằng chứng doanh thu lịch sử trong runtime

Ngày 22/10/2026, giờ Việt Nam. Tiếp tục [InvoiceScope Total/Child](DGC_REVENUE_SCOPES_20261022.md). Đã thêm **phần xác minh/đọc evidence** của historical source adapter. Chưa mở adapter vận hành để issue Invoice, nhập AR hoặc ghi payment; không coi source Approved là local approval.

## Phần đã triển khai

`historical-revenue-source.ts` cung cấp `readHistoricalRevenueSource` và API chỉ đọc:

```text
GET /api/v1/dgc-migration/revenues/:id/source-evidence
```

Reader kiểm phiên bản `DGC_REHEARSAL_ONLY` hiện có từ rollback-only materializer. Đối chiếu Revenue → DgcImportLink → DgcImportRow/DgcImportSnapshot theo **company UUID + expected snapshot hash**, source spreadsheet ID, sheet/physical row/legacy ID/hash. Tính lại hash values/cells và target Revenue projection đúng định dạng rehearsal; không chấp nhận một sourceKind mới tự xưng đã được nghiệm thu.

Tiếp tục kiểm Reconciliation/Item cùng company/service/partner/contract/kỳ/currency; money của row/item/calculation khớp nguyên nguồn, không sửa hay tính lại. Period chỉ đọc YYYY-MM đã capture, target là cả tháng đúng ngày đầu/cuối kỳ; không dùng reporting timezone. Document/legacy Recon raw JSON có hash riêng và được đối chiếu lại hàng staged tương ứng; không ghép bằng ID lớn hơn hoặc số tiền giống nhau.

Reader chỉ chấp nhận bản rehearsal BLOCKED/isCurrent=false, SYSTEM_IMPORT, local creator/approver/validator trống, không source attachment/upload/approvedById giả. Phiên bản rehearsal này chỉ có USD như writer hiện có; không diễn giải MZN evidence thành tiền vận hành. Đây không phải giới hạn USD/VND chung của DGC; định dạng vận hành/historical VND sau này cần policy riêng.

Kết quả phân biệt rõ:

- Source Approved_By và Approved_At/Created_At giữ **raw value + displayed value**. Serial `46245.657010740746` được bảo toàn khi round-trip PostgreSQL qua canonical JSON string. Không chuyển thành timestamp theo timezone chưa chọn, không map email nguồn sang local user.
- Migration `recordedAt` lấy từ provenance link, tách khỏi thời điểm duyệt nguồn. Local approvedById/approvedAt vẫn null; `localApprovalCreated=false`.
- Management amounts và Invoice USD basis giữ riêng. Không tái áp tax/share/FX hiện tại, không phân bổ receipt hoặc tự sửa chênh lệch source/PDF.
- `management.sourceNet` là Net_Revenue gốc; `management.targetNet` là netAmount đích đang ánh xạ từ Company_Share. Hai trường vẫn khác nhau khi có Partner_Share, không đổi tên hai basis thành một số chung.
- `readOnly=true`, `operationalUseAllowed=false`, `postingAllowed=false`, `acceptance=false`, `historicalCashPosting=false`. Chưa kiểm bytes PDF ở reader này; `originalPdfVerified=false` luôn rõ ràng.

Phạm vi hash verifier là source row, document/legacy row evidence và target Revenue/item/context. Reader **không dựng lại toàn snapshot/combined review/financial plan**, không nghiệm thu business gates, toàn bộ header totals, master mapping hoặc Invoice/payment/AR bằng việc hash khớp. Operational adapter phải kiểm các gate đó trước khi sử dụng nguồn lịch sử cho nghiệp vụ.

## Quyền truy cập và cấu hình

Raw staged rows là private evidence, không đưa vào reader REVENUE_VIEW thông thường. API technical review dùng **SYSTEM_CONFIG_EDIT** và chỉ DGC; không cấp quyền mới hoặc sửa Staff/Accountant/Manager/BOD presets. Thiếu quyền bị 403; GST/công ty khác bị 404; query tùy ý/companyId override bị 400. Không có POST/approve/activate, không trả raw cells, raw JSON, Note, source file URL hoặc config paths. Source actor được trả trong evidence chỉ cho technical reader có quyền này. Response `Cache-Control: no-store`.

Cấu hình riêng, mặc định chưa bật:

```dotenv
DGC_MIGRATION_EVIDENCE_COMPANY_ID=<DGC company UUID>
DGC_MIGRATION_EVIDENCE_SNAPSHOT_HASH=<expected source snapshot SHA-256>
```

Chưa cấu hình hoặc cấu hình thiếu trả 503. Hai biến này **chỉ ghim reader**, không nghiệm thu financial plan hoặc cho phép import/approval. Không thay `.env` thực tế, không gán người dùng thật, không tạo UI cho endpoint này. Financial guards ở Invoice/AR/payment hiện tại được giữ nguyên, vẫn không nhận rehearsal records.

## Kiểm tra đã chạy

- API TypeScript build đạt.
- **92 assertions characterization/HTTP**: actor/date fidelity, private-field filtering, permission/company/config, row/link/target/item drift, fake local approval/upload/sourceKind, source money/status/period/currency và rehash target không vượt source policy. HTTP dùng auth/transaction doubles; không mô tả đây là end-to-end DB authentication test.
- **59 assertions PostgreSQL thật** trên DB mới `dgc_migration_staging_source_20261022_synthetic`, container DGC loopback 55433. Áp 22 migrations vào DB trống riêng. Seed source/master/blocked target/provenance hoàn toàn synthetic **trong transaction**, reader kiểm đúng raw serial và hai basis tiền; drift Revenue/Item/Reconciliation/pin bị từ chối. Đọc không đổi counts; không có Invoice/AR/payment/cash/upload/document. Transaction rollback; cả 14 nhóm bảng được kiểm đều trở về 0.
- Kiểm compatibility bằng chính `stageSnapshot` → `applyMasters` → `rehearseRevenue`, không chỉ fixture ORM. Reader đọc đủ hai Revenue do materializer tạo sau replay, source raw serial và target hashes khớp; rehearsal rollback bằng savepoint rồi outer transaction rollback cả masters/staging. Không export hoặc thêm committing writer vào migration tools.
- **20 suite migration hồi quy đạt**. Không sửa snapshot thật, 3.154 staged rows/37 master links hoặc financial state của staging cũ; không push/deploy/GST changes.

```powershell
pnpm --filter @erp/api build
pnpm --filter @erp/api test:historical-revenue-source
# Chỉ DATABASE_URL localhost /dgc_migration_staging_source_*_synthetic trống:
pnpm --filter @erp/api test:historical-revenue-source:integration
pnpm test:migration
```

Tiếp tục: định dạng operational historical provenance/acceptance riêng, giữ actor/date source và technical import actor tách biệt; gắn original attachments đã ghim với nguồn lịch sử. Sau đó tích hợp source guard cho Invoice/AR/payment/cancel và diễn tập restore toàn chuỗi rollback/replay. Không đặt sourceKind accepted hoặc tạo upload APPROVED giả để bỏ qua các bước này. Financial link proposals, SOA cutoff/timezone, PDF thiếu và real-user roles vẫn theo bàn giao.
