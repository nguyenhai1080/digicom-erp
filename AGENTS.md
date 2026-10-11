# ERP Core inherits ERP DGC

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

