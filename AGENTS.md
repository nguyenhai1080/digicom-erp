# ERP Core inherits ERP DGC

## DGC independent repository (2026-10-19)

- Owner decisions (2026-10-23): deploy DGC web and API together as one website/Node process using the root Dockerfile; PostgreSQL and persistent document storage remain DGC-only resources. The dedicated repository is https://github.com/nguyenhai1080/digicom-erp.git, branch `dgc/main`. Reporting timezone is confirmed `Asia/Ho_Chi_Minh`; this supersedes earlier timezone-pending notes. Preserve donor raw dates/timezone as source evidence. Owner target is cutover on 2026-10-23; complete environment, import/reconciliation and UAT gates before actual cutover, never treat rollback trials or an online empty app as completed migration.

- Vibehost Git import still detects `apps/api` and `apps/web` as two projects on `dgc/main`, even with the unified Dockerfile. Host deployment must use generated branch **`codex/dgc-deploy`**, root `/`, Dockerfile, port 3000, `ERP_WEB_ROOT=/app/public`. Generate with `scripts/package-single-site.mjs`; the release tree has one Fastify application, prebuilt UI in public, and a database library with schema/migrations. Keep source development on dgc/main; regenerate/test/publish the deployment branch after source changes. Never hand-edit the generated UI or publish artifacts containing donor records/secrets.

- Owner clarification (2026-10-20): accounting employees may enter monthly FX while preparing both input/output reconciliations. DGC_ACCOUNTANT is a target role based on Staff plus REVENUE_FX_CREATE, RECON_REVIEW, INPUT_RECON_VIEW/GENERATE; final approval, restamp, signing configuration and cash posting remain separate. Do not revert accounting FX access to Manager/BOD-only based on donor roles. See docs/handover/DGC_ACCOUNTING_PREPARATION_20261020.md. No real-user role assignment has run.

- Owner correction: DGC does not require operational MZN support. Use USD/VND, with USD as the initial company currency. MZN figures in donor PDFs/snapshots remain source evidence for reconciliation; do not add MZN account/payment workflows or silently convert historical values. Currency scope does not determine the reporting timezone, which still requires confirmation.

- This checkout is DGC Finance, branch `dgc/main`; read START_HERE.md and docs/handover/PROGRESS_20261019.md before continuing. Do not push it to the GST upstream or deploy to GST services.
- Keep database, storage, credentials and deployment services separate from GST. The current Vibehost connector was verified as GST Vietnam, not the required old DGC account.
- DGC uses the separate DGC_V61_V1 Invoice adapter, confirmed invoice profile and separate logo/stamp/signature assets; GST keeps its own renderer. Owner explicitly authorized combining stamp, signature and signer-title/name into one image for DGC output reconciliation (2026-10-19). Use DGC's tenant-owned SIGNING_COMPOSITE, generated from its originals or explicitly uploaded; never copy GST assets/templates. DGC recon inserts this single image on every page, uses RECON_APPROVE for direct finalization and additionally RECON_RESTAMP for approved placement-only changes. Full Staff/Manager/BOD role provisioning remains pending. See docs/handover/DGC_MIGRATION_AND_INVOICE_20261019.md.
- Local migration tools accept only localhost databases named dgc_migration_staging_*. Raw staged rows are private evidence, not posted financial records. The real snapshot currently has 10 services, 4 partners, 9 contracts and 14 contract-service links imported into local staging (37 provenance links). The owner explicitly approved Movitel Active, six contract tax rates exactly 0.1, MYCLIP → MEUCLIP and MEU PAR → MEUPAR. Decisions are snapshot/row-hash bound and audited; source cells and historical amounts remain unchanged. All financial imports remain pending.
- InputRecon/AP runtime and PDF are implemented for new DGC records; see docs/handover/DGC_INPUT_RECON_AP_20261020.md. Generation is a draft; explicit INPUT_RECON_APPROVE creates one AP atomically, without cash posting. Keep donor rounding order and source snapshots; do not recompute historical imported amounts with this generator. SOA payment cutoff semantics are awaiting owner confirmation.
- DGC tables default to 10 rows, including cash reports. GST's exception of 12 rows does not apply here.
- DGC receipt-history reads use INVOICE_PAYMENT_VIEW separately from PAYMENT_VIEW. Read-only DGC users receive no cash-account catalog. Do not grant PAYMENT_VIEW to Staff to expose Invoice history; cash reports and evidence-document download retain existing permissions. See docs/handover/DGC_RECEIPT_READ_20261020.md; role templates are still proposals, with no real-user provisioning.
- DGC monthly reporting FX creation/import uses REVENUE_FX_CREATE (Accountant/Manager/BOD proposals), separate from SYSTEM_CONFIG_EDIT; GST retains its legacy permission. Existing periods are create-only, never silently overwritten. See docs/handover/DGC_FX_ACCESS_20261020.md and the newer accounting owner decision above; no real-user provisioning has run.
- DGC manual revenue uses MANUAL_REVENUE_CREATE/EDIT/SUBMIT/APPROVE/CANCEL separately from OCR RECON permissions; do not grant RECON_REVIEW to Staff just to submit manual revenue. Proposed DGC_STAFF/MANAGER/BOD templates are partial and never auto-provisioned. See docs/handover/DGC_ROLE_ACCESS_20261020.md; existing custom DGC roles need explicit manual-revenue permission mapping before deployment.
- DGC unpaid Invoice cancellation is implemented with INVOICE_CANCEL, preview/digest/reason, payment/AR/reference guards and atomic audit. Retain cancelled Invoice/AR amounts and files; exclude them from current AR and release source revenue for a new revision. Future SOA/package creators/importers must call linkInvoiceDocuments once for the full invoice set in their transaction before exposing cancellation on imported records. See docs/handover/DGC_INVOICE_CANCEL_20261020.md; registry/schema coverage does not establish SOA runtime parity.

The owner clarified on 2026-10-08 that ERP Core must inherit the full existing ERP DGC functionality and business behavior. The new business domain is Projects. Do not replace DGC with a simplified unrelated ERP or use project workflows as substitutes for existing service finance workflows.

- The confirmed donor is the owner's DGC web deployment, Apps Script version 61. See docs/DGC_INHERITANCE_BASELINE.md, docs/DGC_SOURCE_INVENTORY.json and docs/DGC_DATA_CATALOG.json.
- Read the actual donor implementation for every feature: fields/defaults, statuses, permissions, formulas, document templates, upstream/downstream effects and integrity guards. A screenshot alone is insufficient.
- Existing PostgreSQL schema, successful builds, infrastructure health and project tests do not establish DGC business parity. Keep schema coverage, implemented runtime behavior and accepted parity distinct.
- Preserve the current DGC service/partner/contract, reconciliation, revenue, invoice, payment, AR/AP, SOA, reporting and administration behavior. Projects extend shared partner/service/contract/financial modules; they must not duplicate or redefine those modules.
- Use DGC numerical expectations as characterization fixtures before adapting arithmetic to Decimal. Record differences in defaults, rounding, roles, effective dates, sources and side effects. Known source defects must be recorded explicitly rather than silently reproduced or silently corrected.
- Preserve existing GST identity and records. Source extraction does not authorize importing live financial data, overwriting records, running donor repair/migration functions, changing permissions or replacing the live DGC application.
- Keep raw donor source in ignored artifacts/dgc-reference; never execute it or publish configuration/authentication material. The catalog is safe metadata, not raw records.
- The revised roadmap takes precedence over older incremental project-first plans. Pause new deployment work until the inherited scope and target feature behavior are grounded in the donor. Do not push documentation-only audit changes just to trigger auto-deployment.
- Synced ChatGPT project sources are read-only.

## Owner UI rule (2026-10-11)

- Every data table displayed to users must provide pagination. Use 10 results per page by default, with previous/next controls and page/total counts. Apply this consistently to new and revised list views.


## Owner partner display rule (2026-10-12)

- Display partner keys in data tables instead of full legal names. Keep legal names available in profiles, hover text and financial documents.

## Owner historical payment and cash flow rule (2026-10-13)

- Historical receipts imported from the owner's workbook update Invoice, revenue and AR status only. Do not post them to bank or cash account balances.
- Future cash accounts have two types: official bank accounts and cash funds for company/office spending. All receipts, payments, expenses and internal transfers belong in Quản lý thu chi.
- Future receipts increase bank balances; payments decrease them. Transfers from bank to cash funds decrease the bank and increase the cash fund as one linked transfer, without counting it as revenue or expense.
- Apply those balance movements only after completing historical imports and establishing the current cash ledger; do not invent historical bank accounts or actual VND receipts.
