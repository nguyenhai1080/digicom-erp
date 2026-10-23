# Đối chiếu nguồn và bản DGC v10

Cập nhật tiếp: [v11/storage và host finance bridge](DGC_HOST_FINANCE_BRIDGE_20261023.md) đã xác minh marker preserved qua redeploy, backup website/restore marker local đạt; browser đã hết timeout. Các giới hạn/chưa kiểm dưới đây mô tả thời điểm v10; financial PDF/full application/config restore vẫn chưa nghiệm thu.

Ngày 23/10/2026. Đọc cùng [quyết định owner](DGC_FINANCIAL_OWNER_DECISIONS_20261023.md), [master transfer](DGC_MASTER_TRANSFER_20261023.md) và [roadmap](DGC_ROADMAP_STATUS_20261022.md).

## Triển khai đã xác minh

- Digicom-Erp v10 trực tuyến trên `https://digicom-erp.n1.tinhgon.xyz`, đúng tài khoản DGC, nhánh `codex/dgc-deploy`, deploy commit `a66f1aa7`, source `8e2109705028d7d9aa5347eaf3cc54f2b32126e8`.
- Host health-gate/public route 200; phiên admin vẫn hoạt động sau reload, SOA hiển thị chính sách chỉ trừ thu đến hết ngày chốt. Không có dữ liệu tài chính giả được tạo để kiểm production. Đối tác SOA rỗng vì tài chính chưa nhập.
- Runtime ghi PostgreSQL `dgc_erp_db`, 24 migrations, không có migration pending. Bootstrap, seed và master transfer tiếp tục đóng theo cấu hình v9; đợt này không bật lại.
- `ERP_STORAGE_PROBE=true`: runtime v10 ghi `created`, marker ID `330711dc-3bf0-452d-b703-a407e230074f`, createdAt `2026-10-23T09:59:10.583Z`. Chỉ chứng minh ghi được marker, chưa chứng minh giữ qua thay container hoặc restore file. Cần quan sát cùng ID/date với `preserved` ở lần redeploy sau. Browser timeout khi chuyển tiếp sang cấu hình; chưa phát lệnh redeploy v11 và không suy đã hoàn tất phép kiểm đó.
- Ảnh private đã kiểm tồn tại: `artifacts/dgc-deploy/20261023/dgc-v10-online.png` (39.236 bytes), `dgc-v10-soa-policy.png` (47.839 bytes), `dgc-v10-storage-created.png` (65.996 bytes). Browser inventory phục hồi và xác nhận tab đã đến config, nhưng chọn/đọc tab tiếp tục timeout; chưa redeploy v11.

## Nguồn đọc lại

Đã kiểm MIME native Google Sheet, title `DGC_ERP_2026_PROD_RC1_CLONE`, spreadsheet ID `1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A`, sheet IDs/bounds và sentinel headers trước full read. Đọc đủ bounds của đúng 25 bảng nghiệp vụ đã có trong baseline. Không đọc/sửa người dùng hoặc cấu hình xác thực, không chạy donor Apps Script hoặc repair.

Capture dùng `userEnteredValue,effectiveValue,formattedValue,effectiveFormat(numberFormat),hyperlink`, đúng các thuộc tính row hash baseline. Sparse evidence giữ physical sourceRow; không ghép theo legacy ID vì nguồn có ID trùng. Ngày serial/timezone nguồn `America/Los_Angeles` giữ nguyên; reporting timezone DGC vẫn `Asia/Ho_Chi_Minh`.

Kết quả: **3.154 unchanged rows; 0 changed, added hoặc removed; 0 changed headers/bounds** trên cả 25 bảng. Report hash `6b1db33fd2923ca0bb2c27335eb538ab4734984ba527205e830ba627bfbff8b6`. Metadata modifiedTime của Drive không dùng làm bằng chứng duy nhất; kết luận dựa full row hashes.

Evidence private trong `artifacts/dgc-migration/20261023/source-delta`: `metadata.json`, `live-cells-complete.json`, `report.json`. Bản `live-cells.json` đầu tiên thiếu hyperlink trong field mask chỉ là capture trung gian, không dùng chứng minh exact row hash. Không commit/publish raw capture.

Đây là `MULTI_REQUEST_NOT_FROZEN`. Không tự đổi snapshot/approval pins, không rebase quyết định đã duyệt hoặc thay snapshot cuối tại cutover. Chỉ kết luận workbook được kiểm còn khớp baseline trong lần đọc này, không suy các hệ thống/tài liệu ngoài workbook đã được khóa.

## Tool và bước tiếp

`scripts/dgc-source-delta.mjs --baseline <private snapshot> --capture <private live-cells-complete> --out <new private report>` chỉ đọc local evidence và ghi report mới bằng exclusive create. Chặn sai workbook, sheet ID, calendar/locale, thiếu bảng/range, physical row trùng/vượt bounds và mask thiếu thuộc tính. Report chỉ có field names/hashes, không lặp raw giá trị. 31 assertions đạt; không gọi DB hoặc tạo financial records.

Tiếp tục operational financial adapter/files/receipts, đối chiếu staging và UAT. Chưa có financial import chính thức hoặc cutover. Không hỏi lại ba mappings hoặc SOA cutoff đã chốt; các thiếu PDF/chênh lệch nguồn còn lại giữ worklist riêng. Trước go-live cần hoàn tất kiểm storage qua redeploy/backup/restore, snapshot cuối và go/no-go.
