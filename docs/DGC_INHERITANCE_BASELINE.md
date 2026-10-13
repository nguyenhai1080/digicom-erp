# ERP Core = ERP DGC inherited + Projects

Owner scope correction: 2026-10-08. ERP Core must carry forward the existing DGC functionality and business operations. Projects are the additional domain. Changing infrastructure to PostgreSQL/Node/React does not authorize discarding DGC behavior or introducing different financial rules.

## Confirmed donor source

The owner's web URL is https://script.google.com/macros/s/AKfycbydoqLjQT7f4tP3Y-6fiieQpNOOuk1GMXP45SNQo0uVKDE9KovuBJ5PeG1wJ32L03G4/exec.

Read-only Apps Script deployment listing confirmed that this exact deployment points to **version 61**, described as `Prevent-recurring-small-OCR-and-cancelled-invoice-errors`. Retrieved that immutable version with `clasp pull --versionNumber 61` into ignored `artifacts/dgc-reference/deployed-v61`. All 24 files were fetched, including the app manifest. The older cached source is different and is not the donor baseline. The constant app version inside source is stale (`2026.08.10-v8.109-workflow-core-invoice-ar`); use the verified deployment version and file hashes.

The complete source archive is `artifacts/dgc-reference/DGC-deployed-v61-source.zip`. It excludes the local CLI project configuration. Source retrieval did not mutate DGC, its workbook, permissions or deployments.

- [Source catalog](DGC_SOURCE_INVENTORY.json): file hashes, named top-level function declarations, source lines and literal role checks. 572 backend declarations and 175 frontend declarations were indexed. These counts include helpers and maintenance functions, not 747 user-facing features. The catalog is a static inventory, not a complete semantic access analysis.
- [Data catalog](DGC_DATA_CATALOG.json): declared sheets and literal header assignments, including runtime overrides. These are source declarations, not an export of live records or a verification of current workbook contents.
- Live read-only navigation confirmed all 12 DGC sidebar modules and their action controls. No operational buttons, approval, upload, repair or transaction actions were submitted.

## Functionality coverage and actual gaps

Reviewed target at code commit `03fdee55` (staging v0.6.11). A model in Prisma is only a structural foundation. The following table describes implemented runtime behavior separately.

| Existing DGC module | Source and behavior to inherit | ERP Core runtime now |
| --- | --- | --- |
| Dashboard | `60_Reports_Dashboard.js`, `Index.html`: approved monthly revenue, AR/AP, approved cash movement and service/month charts | Infrastructure/company cards only; business KPIs and charts missing |
| Dịch vụ | `10_MasterData.js`: create/edit/delete safeguards, code/name/category/keyword/dates/status, dependent finance records | v0.6.12 adds inherited create/view/edit/guarded delete and full profile; see DGC_SERVICE_PARITY.md for mappings, adaptations and pending role/data migration work |
| Đối tác | `10_MasterData.js`: full profile, Active/Inactive/Blacklist behavior, code/ID and billing-contact fallbacks, referenced deletion guard | v0.6.14 adds immutable identity/editable code, DGC defaults/fallbacks/statuses, all-status list and guarded deletion; see DGC_PARTNER_LIFECYCLE_V0614.md for adapters and pending finance/data migration work |
| Hợp đồng | `10_MasterData.js`: Input/Output/Other service contracts, multiple services, share/fixed fee, tax, billing cycle, effective dates, status, owner and attachments | v0.6.15 adds Input/Output/Other CRUD, multi-service historical links, decimal rates/fees and dates; project MAIN remains separate. Live donor import and downstream financial modules remain pending |
| Đối soát đầu ra | `20_Recon_Core.js`, `21_Recon_OCR.js`, `22_Recon_PDF_Approval.js`: Movitel PDF/OCR, matching partner/contract/service/period, manual review, duplicate/replacement preflight, approval and stamp | v0.6.17 adds local PDF text/scan OCR, source metadata workspace and service/month/contract matching on top of intake; financial detail parsing, reviewed validation/approval, stamping, revenue and financial replacement remain pending (DGC_OUTPUT_RECON_READING_V0617.md) |
| Đối soát đầu vào | `53_InputRecon_AP.js`: FX, matching active/effective input contracts per service, generate missing reconciliations, BOD approval, AP and statement PDF | Not implemented as a runtime workflow |
| Doanh thu | `30_Revenue.js`: monthly entry, submit/approve, reconciliation import, aggregate/detail flags and source traceability | Revenue schema only; no monthly revenue entry/import/approval UI/API |
| Invoice | `40_Invoice_Core.js`, `41_Invoice_PDF.js`: source selection, grouping, preview/stamp, issue, current revision, guarded regeneration/cancel, payment-derived status | InvoiceScope is preparatory structure; actual invoice header/detail/issue/PDF/revision runtime missing |
| Thu chi | `51_Payment_Transaction.js`, `10_MasterData.js`: accounts/categories, receipts/payments/transfers, approval, invoice payment, SWIFT attachment, balances | Runtime and account/payment/transaction models missing |
| Công nợ | `50_ARAP.js`: current AR per issued invoice, AP per approved input recon, paid/outstanding/status, duplicate integrity | Actual AR/AP runtime missing |
| SOA (within Invoice) | `52_StateOfAccount.js`: partner statement, date/invoice filtering, one-current-AR guard, preview/placement/create/delete/PDF | Missing |
| Báo cáo | `60_Reports_Dashboard.js`: revenue, receivables/payables, cashflow, account balance | Missing |
| Quản trị | `03_Auth.js`, `02_Setup_Config.js`, `80_Audit_Integrity.js`, `81_OutputFlow_Audit.js`, `90_Migrations_Repair.js`, `92_Legacy_ApprovalPackage.js`: Staff/Manager/BOD, user management, settings, audit, approval package and diagnostics | Login/CSRF/company RBAC and generic audit exist; donor administration/diagnostic/approval-package UI and role parity missing |
| Projects — additional domain | Link into inherited partners/services/contracts/finance without replacing donor modules | Initial project budgets/costs/milestones/PDF/draft-contract commands exist; formal acceptance is incomplete |

## Source-grounded rules already identified

These are concrete examples from version 61; the complete ruleset still requires command-by-command characterization. Do not mark a module accepted from this initial list alone.

1. **Partner defaults and fallbacks** — `10_MasterData.js:createPartner` (line 58) defaults status to Active and country to Mozambique; contact/invoice names/emails and billing/registered addresses have explicit fallback rules. Target v0.6.11 defaults PROSPECT and keeps several values independently. Country/company-specific adaptation must be explicit; the form field match alone was insufficient.
2. **Service contracts are not project MAIN contracts** — `createContract` (line 164) creates Input/Output/Other contracts, synchronizes many service links and stores share rate, fixed fee, tax, billing cycle and dates. MAIN/ADDENDUM project classification is a separate dimension.
3. **Output reconciliation replacement** — `20_Recon_Core.js:DGC_reconBusinessKeyV81180_` / `DGC_applyReconReplacementV81180_` identify and replace a source chain with preflight and superseded history. Preserve blocking invoice/payment dependencies and latest OCR/period/service matching fixes.
4. **Revenue totals** — `30_Revenue.js:DGC_isRevenueIncludedInMonthlyTotal_` prevents aggregate and detail double-counting. Submitted/Approved transitions and source references must be retained.
5. **Invoice issue** — `40_Invoice_Core.js:DGC_assertInvoiceIntegrityBeforeIssueV81170_` requires detail rows, approved referenced revenue, active reconciliation sources, nonnegative lines, and header/detail agreement within the donor tolerance (0.02). Business key, grouping modes and current revisions must be ported together.
6. **Invoice cancellation/regeneration** — paid invoices or linked payments/transactions block replacement/cancel; cancellation also guards SOA and approval-package references. A Draft must remain Draft until explicitly issued; being past due alone must not issue it.
7. **AR cardinality** — `50_ARAP.js:DGC_assertInvoiceArapOneToOneV8122_` requires exactly one current AR for applicable current issued invoices. No independent duplicate AR generation from two paths.
8. **Payment side effects** — `51_Payment_Transaction.js:recordInvoicePayment` (line 149) blocks Draft/Paid/Cancelled/Superseded or stale-source invoices, positive USD amounts cannot exceed outstanding beyond the donor tolerance (0.01), and USD/VND/payment-FX values are separate. The runtime checks active VND account ACC0001, one current AR and payment/transaction postconditions. Preserve the intent with an explicit account mapping; do not invent a replacement account or change currency silently.
9. **Input reconciliation** — `53_InputRecon_AP.js:generateInputReconciliation` matches active input contracts effective for the period and per-service share rates, uses approved output revenue and deduplication keys. The observed path bases sharing on Invoice_Payable_USD, calculates foreign share, FX, local amount, tax/WHT and payable in sequence with rounding. Helpers include explicit MZN/FX bases and fallbacks. `approveInputReconciliation` requires BOD and creates/updates AP.
10. **SOA** — `52_StateOfAccount.js:DGC_buildSoaData_` (line 353) excludes ineligible invoices and requires one current AR. Date/as-of semantics need dedicated tests: this version filters invoice dates against asOfDate, while its payment summation call receives only invoice ID. Record that ambiguity/possible defect and verify expected business semantics before either reproducing or changing it.
11. **Roles and monetary conventions** — donor roles are Staff/Manager/BOD; core default currency/timezone are MZN/Africa/Maputo and enabled currencies are MZN/USD/VND. Target authentication is a new technical implementation; equivalent business permissions and reporting date/currency meanings must be mapped explicitly.
12. **Maintenance and legacy approval** — retained source includes integrity diagnostics, backfills, rollback/repair and approval-package handlers. Inventory them all; distinguish normal commands from historical repairs. Never run donor maintenance on live data merely to discover behavior.

## Revised implementation order

### Owner-authorized historical records (2026-10-13)

The owner requested spreadsheet history to be imported, approved, invoiced, published within ERP and settled according to the received-payment column. Historical publication is recorded separately from confirmation that an Invoice was sent. Both use the inherited issue plan, source/file integrity, permission, digest and one-current-receivable guards from `40_Invoice_Core.js`.

`51_Payment_Transaction.js:recordInvoicePayment` requires USD allocation plus actual VND bank receipt. The historical extension preserves those requirements for ordinary receipts and adds explicit source-referenced historical receipts in their original cash currency. Allocation amount, cash amount and cash currency are stored separately; unknown VND receipts/FX are null and unknown bank accounts stay empty. A reporting conversion may allocate an original USD receipt to an owner-authorized VND historical Invoice; it is marked as a reporting conversion, not actual bank FX. Invoice, current AR and source revenue update atomically through the shared payment command, with existing stale-source, balance, permission, idempotency and rollback guards. Missing historical receipt dates may use period-end plus 60 days only when the owner confirms that basis; the basis remains visible in payment history.

1. Freeze the donor snapshot and build complete UI/action/field/status/role/calculation/effect maps from it. Resolve known target differences and source ambiguities. Preserve source provenance for each implemented command.
2. Bring inherited commercial master data to parity: service, partner, account/category and service contract features. Keep the existing GST identity; project-specific contract drafts remain an extension.
3. Restore the operational service chain in dependency order: output PDF/OCR → reviewed reconciliation → approved revenue → Invoice preview/issue/revision → current AR → payment and balance updates.
4. Restore the linked input chain: effective input contracts/service-share rules + FX → input reconciliation → BOD approval → AP and PDF.
5. Restore SOA, business Dashboard/reporting and DGC administration/diagnostics. Some role and audit prerequisites will be built earlier alongside their dependent commands.
6. Once inherited financial endpoints and shared concepts are validated, complete the additional Projects lifecycle and link its costs/acceptance/billing into them. Do not create parallel incompatible finance flows.
7. Validate a staged data migration using preserved donor identifiers, links, history and attachments; reconcile approved revenue, current invoice totals, AR/AP, payments and balances with a reference export. Source retrieval does not itself migrate business records. No actual financial export/import has been performed in this audit.

Every inherited feature needs source evidence, field/default/state/role mappings, meaningful comparison fixtures and end-to-end effect checks. Infrastructure health, an empty screen, schema packs and the existing 273 technical checks do not prove DGC parity. Existing releases remain infrastructure/partial functionality baselines, not completed DGC migration.

## Deployment scope

This correction is a local audit and roadmap change. No new application deployment, no push to the auto-deploy develop branch, no new database and no changes to current DGC data or deployment. Preserve the existing ERP Core source rather than recreating the repository; subsequent work ports the missing inherited features into that codebase.
