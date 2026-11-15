# Hồ sơ chứng từ, nhận tệp đầu vào và email — v0.6.112

Owner yêu cầu lưu bảy biến thể trong bốn nhóm (output recon gốc/ký, output Invoice gốc/ký, input recon gốc/ký hai bên, input Invoice ký đối tác), tổ chức tên/thư mục, nhập bản ký và Invoice đầu vào, email mọi loại. Owner bổ sung: **chỉ ghi AP sau khi nhận bản đối soát đã ký hai bên**. Quy tắc này supersedes các ghi chú109 về legacy approve không đổi.

## Triển khai

- `DocumentDossier` là tab dùng chung trong Quản lý đối soát/Invoice, có lọc đầu vào/đầu ra, kỳ/đối tác/hợp đồng, bản hiện hành/cũ, PDF và chọn tệp email. Nút sau lưu PDF InputRecon mở đúng hồ sơ; không thêm menu chính.
- Phân loại năm/kỳ/đối tác/hợp đồng/loại/biến thể; tên chuẩn an toàn có phiên bản/checksum. Blob cũ không di chuyển hoặc sửa. Tệp nhận và output Invoice unsigned mới dùng `dossiers/<company>/<year>/<period>/<partner>/<contract|all>/<kind>/<attachment>.pdf`. DB attachment giữ đường dẫn/checksum; tên gốc upload trong audit. Bộ khôi phục kho hiện có lấy đệ quy nên bao gồm nhánh mới.
- Native output Invoice create lưu thêm PDF unsigned từ đúng dữ liệu/tài sản của cùng giao dịch và pin `originalDocumentId` trong snapshot. Signed PDF/workbook/phát hành/tiền giữ luồng hiện hữu. Không dựng lại unsigned lịch sử khi thiếu.
- Migration `20261115010000_input_document_receipts` chỉ thêm bảng `input_document_receipts`, composite tenant FKs tới Document/source/Contract/Partner, request idempotence/indexes và CHECKs. Không sửa bảng tiền hoặc cấp role/permission/env. Không chạy seed trên host.
- Nhận input signed/invoice bằng quyền INPUT_RECON_GENERATE+VIEW, nguồn là PDF gốc đã lưu đầy đủ đúng hợp đồng/kỳ/mạng; xác nhận chữ ký, số/ngày Invoice, kiểm PDF16MB/200trang, lưu nguyên bytes, phiên bản mới có expectedPreviousDocumentId. Khóa công ty/request digest chống nhập lặp/race; lỗi hoàn tác DB và file. Chữ ký chỉ được người nhập attest, không xác minh chứng thư. Không auto approve.
- AP gate chung `requireSignedInput` trên cả group và legacy single approve: PDF gốc ACTIVE/bytes, snapshot nguồn/phạm vi đầy đủ (captured giữ dữ liệu riêng), duy nhất receipt signed ACTIVE gắn đúng sourceDocumentId, tenant/hợp đồng/kỳ/mạng và bytes ký. Pending group digest pin signed document/version/checksum; replacement cần preview mới. AP cũ/idempotent read được giữ; không hồi tố hoặc tạo AP cho dữ liệu cũ. InputInvoice không tạo khoản AP khác.
- Catalogue đọc nguồn output native/captured qua resolver provenance hiện hữu; captured ký không fallback PDF gốc. Bản superseded hoặc source thay đổi chỉ tra cứu; không email. Invoice thiếu bản unsigned hiển thị rõ, không tự sửa.
- Email generic tái dùng SMTP hiện có; chọn đúng tệp cả bảy loại, gói cùng đối tác/kỳ,50tệp/18MB, quyền per-kind, Origin/CSRF, checksum/read lại và preview digest. Audit attempt trước transport, request/content replay guards, rate limit, ACCEPTED/PARTIAL/REJECTED/UNKNOWN và không auto retry. Gửi không tương đương phát hành/ghi sổ. Email Invoice cũ vẫn hoạt động riêng.

## Kiểm tra và giới hạn

Kiểm thử dùng DB/kho/mail giả lập, không tệp thật hoặc SMTP thật. Kết quả:

- API/web build và69 unified-web checks đạt.
- Windows:464 InputRecon/AP +99 dossier checks; có upload canonical bytes/tenant/provenance/quyền, rollback/races/replay, phiên bản cũ, số Invoice phân biệt năm/không phân biệt hoa thường, bảy biến thể/email bytes, thiếu ký/tampered/stale, mail UNKNOWN và no financial writes.
- Linux Node22 CPU0.3/RAM512MB/heap192MB:464 InputRecon/AP +88 dossier checks của luồng nền đạt; bổ sung date/year/history được kiểm trong99 Windows checks.
- Invoice:251 assertions trên Windows và Linux cùng giới hạn trên, bao gồm lưu unsigned/signed cùng giao dịch, tám nhóm dịch vụ, rollback/immutable assets/issue/AR/no cash. Linux tám nhóm preview+checks+create26395ms.
- Browser giả lập:27 kho chứng từ (upload/mail confirmation, no AP call, quyền,390px) +41 luồng hợp đồng đạt; PNG desktop/mobile đã xem. Không chạy UAT với hồ sơ/người dùng thật.

Không đổi mẫu/form/công thức/FX/tiền lịch sử/importer; không tự nhập/duyệt/gửi mail trên host. Cash vẫn deferred. Kho chứng từ là phân loại logic cho tệp cũ và cấu trúc mới cho tệp mới, không tuyên bố mọi blob cũ đã được chuyển thư mục vật lý. Không tuyên bố xác thực pháp lý chữ ký.

## Gói triển khai cho host nhỏ

Kiểm tra kiểu và biên dịch API/DB được bắt buộc trong `package-single-site.mjs` trước khi tạo gói phát hành. Gói chứa cả nguồn và JavaScript đã kiểm, cùng BUILD_MANIFEST.json gắn sourceCommit/hash nguồn/build/schema. `build.mjs` trên host kiểm manifest rồi tạo Prisma client, không lặp lại trình kiểm kiểu TypeScript nặng. Sai hash hoặc thiếu mã đã biên dịch sẽ dừng build. Đây là thay đổi cách đóng gói, không bỏ kiểm mã nguồn hoặc tăng tài nguyên chạy: CPU0.3/RAM512MB/heap192 vẫn giữ. Dependency pins giữ nguyên. Gói checked đã build và chạy smoke trên Node22 Linux CPU0.3/RAM512MB/heap192:236 tệp hash và5 kiểm tra sửa nguồn/JS/static/API đạt, không kết nối DB/SMTP. Git attributes giữ nguyên bytes qua Windows/Linux để checksum không lệch do xuống dòng. Compiled dist phải được đưa vào Git và Docker context của nhánh deploy, khác với source checkout vẫn để dist trong ignore.

## Owner

Triển khai lại nhánh `codex/dgc-deploy`; startup chạy migration thêm bảng qua luồng hiện hữu. Không thêm biến môi trường hoặc seed. Sau đó mở mới trang, theo [hướng dẫn](../DGC_DOCUMENT_DOSSIER_GUIDE.md), tự lập PDF gốc và nhập bản ký đúng hai bên; kiểm AP gate/nhận Invoice đầu vào và gửi email nghiệp vụ sau khi review. Chưa có UAT hoặc thao tác tài chính thật cho bản112.
