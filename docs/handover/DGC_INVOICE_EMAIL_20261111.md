# Invoice email — 2026-11-11 — v0.6.105

## Owner scope

Owner requested a Send email action after creating Invoice, attaching saved Invoice and finalized reconciliations from the period to staff or partners. Owner confirmed sender info@digicomjsc.com. SMTP provider/credentials have not been supplied; do not obtain secrets through chat. No permission to send an actual email as a test has been exercised.

## Delivered behavior

- DGC-only buttons in newly saved Draft results and current Invoice lists. Existing INVOICE_VIEW + RECON_VIEW + INVOICE_ISSUE required; no new permission or role assignment. GST UI/runtime unchanged.
- Composer: select current Invoices from one partner/period, company staff/partner contacts or typed To/Cc, subject/plain text, review exact files/warnings, confirmation, explicit send. PDF links use existing authorized readers. Editing selection/content invalidates review. Responsive modal, focus management/Escape, send disabled when SMTP missing or already attempted.
- Server derives all documents through tenant-scoped Invoice scopes -> Revenue -> approved Recon/approved upload. Reuses saved bytes, verifies document state/path/size/SHA256; never renders/re-signs/recomputes. Deduplicates document IDs. Does not attach input/vendor reconciliation to an output customer's package. Captured reader resolver reused without changing original provenance logic. Missing captured PDFs/manual sources explicitly warn; native invalid links block the package.
- SMTP environment-only configuration; default sender owner-confirmed info@digicomjsc.com. Nodemailer 10.5.0 pinned, @types/nodemailer 8.0.2; STARTTLS required on587/TLS465, strict certificates, timeouts, no file/URL transport access. No host env writes or real email.
- Durable append-only AuditLog ATTEMPT and ACCEPTED/PARTIAL/REJECTED/UNKNOWN events, advisory claim lock, request replay guard, five-minute duplicate payload guard, five attempts/minute/company. Digest includes selected document checksums, states, sender and entire recipient/message body. No automatic retries, no delivery/read guarantee. If process/audit fails after SMTP acceptance, retained attempt marks unresolved; no retry of same request ID.
- Draft mail is explicitly labeled. Email never changes Invoice publication/AR/revenue/payment/cash. No schema/importer/asset/role/old PDF changes.

## Validation

- API/web builds passed.
- 61 isolated PostgreSQL route assertions on Windows: auth/Origin/CSRF, tenant, permissions, same-period selection, frozen bytes, dedup, header injection/duplicate recipients, message digest, missing SMTP, MIME attachments, accepted/partial/rejected/unknown, replay/concurrent send, cross-request duplicate guard, rate limit, revoked documents, file tampering, size cap, unchanged finance snapshot. Synthetic injected transport only, never real SMTP recipients.
- 24 synthetic browser checks desktop1440/mobile390: actions, selection/contact addressing, confirmation, edit invalidation, single send, no finance mutation requests, missing-config disabling, Escape, permission/GST gating. Screenshot inspected locally.
- 243 existing DGC Invoice route checks and 47 captured recon history checks passed on separate fresh disposable databases. 69 unified web/API checks passed.
- 61 route assertions also passed in Linux Node22.23.4, CPU0.3/RAM512MB/heap192MB, on its own freshly migrated/seeded disposable PostgreSQL database. Linux build passed (build heap1024MB; runtime heap192MB). Injected MIME transport only; no network email.

## Release / owner action

Publish source dgc/main and regenerated single-site codex/dgc-deploy. Owner redeploys. Configure SMTP privately using docs/DGC_INVOICE_EMAIL_GUIDE.md; provider information is still requested. No real send/host online claim. Owner sends first intended business email personally after checking recipients/attachments. Keep previously deferred cash/importers and original PDFs unchanged.
