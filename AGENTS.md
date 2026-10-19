# ERP Core inherits ERP DGC

## DGC independent repository (2026-10-19)

- Owner correction: DGC does not require operational MZN support. Use USD/VND, with USD as the initial company currency. MZN figures in donor PDFs/snapshots remain source evidence for reconciliation; do not add MZN account/payment workflows or silently convert historical values. Currency scope does not determine the reporting timezone, which still requires confirmation.

- This checkout is DGC Finance, branch `dgc/main`; read START_HERE.md and docs/handover/PROGRESS_20261019.md before continuing. Do not push it to the GST upstream or deploy to GST services.
- Keep database, storage, credentials and deployment services separate from GST. The current Vibehost connector was verified as GST Vietnam, not the required old DGC account.
- DGC uses the separate DGC_V61_V1 Invoice adapter, confirmed invoice profile and separate logo/stamp/signature assets; GST keeps its own renderer. Do not substitute the GST template or composite signature into the DGC flow. See docs/handover/DGC_MIGRATION_AND_INVOICE_20261019.md for current validation and remaining scope.
- Local migration tools accept only localhost databases named dgc_migration_staging_*. Raw staged rows are private evidence, not posted financial records. The real snapshot currently has 10 services and 4 partners imported into local staging; Movitel Active was explicitly approved by the owner. Contract decisions and all financial imports remain pending.
- DGC tables default to 10 rows, including cash reports. GST's exception of 12 rows does not apply here.

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
