# DGC payment fee + bank evidence — v0.6.114

## Requested behavior

Owner screenshot: allocation993.91USD, actualVND25227452, FX25640; bank deducts10USD per payment. Owner additionally requested bank evidence upload. Gross USD settles AR, explicit fee reduces net cash, never silently leaves fee as customer debt or hides it in FX. Do not assume every Invoice costs10USD or apply shared transfer fees multiple times.

## Implementation

DGC LEDGER_ONLY schema optionally accepts bankFeeUsd and existing validated swiftFile shape. Positive fee only for USD Invoice, fee<allocation, Decimal net×FX rounded HALF_UP to integer VND, or exact USD net. No fee retains existing historical conversion semantics; GST historical/native cash schemas remain without fee extension. Original invoice/revenue/AR principal never recalculated. Partial payments allowed, overpayment blocked.

InvoicePayment keeps allocationAmount/paidUsd as gross, cashAmount/paidVnd actual net, fxRate actual rate, bankFee evidence in historicalSource (grossUsd/netUsd/currency/amount/netCashAmount/formula). Request digest and append-only audit bind fee and file bytes. Existing company/period/invoice locks, expected version, source scope, balanced AR and payment sum checks unchanged. Raw optional bank PDF/image stored through existing immutable checksum-verified financial-document storage, transaction rollback cleans failed files. No source uploads, crypto-validity claim, auto-post cash/expense or real payment/file operation.

New migration20261125010000_dgc_receipt_bank_fee replaces the existing receipt check constraint with the identical legacy/captured/native branches plus a narrow bankFee branch. Requires sourceKind, currency/formula, positive fee below gross, matching metadata and exact net arithmetic; missing metadata fails. No columns/backfill/seed, no source trigger edits, roles/env/dependency changes. Deploy uses migrate deploy only. Existing populated synthetic receipt data passed revalidation before testing new receipts.

GET payment/document read gate is DGC INVOICE_PAYMENT_VIEW or GST PAYMENT_VIEW, same as payment reader, with tenant and exact attachment linkage. Posting permissions unchanged. Web shows optional fee blank by default and optional bank file field in DGC ledger-only form, resets confirmation after changes, retains selected file until save, history fee column and authorized document link. Read-only users cannot post.

## Validation / delivery

API/web type-check/build; historical arithmetic and new fee/schema checks passed. Disposable Windows DB:251 HTTP/DB assertions covering existing GST/native/historical paths, DGC gross/net example, partial/no-fee subsequent receipt, strict mismatch/overpay/schema, permissions/CSRF/tenant, file PNG exact bytes, invalid evidence, forced downstream rollback, concurrent same-request/replay, changed fee replay, database constraint rejects fee tamper, unchanged historical receipt and no extra cash entries/balances. Browser24 checks: blank default, USD/VND fee fields, file bytes payload, confirmation reset, history fee/document, read-only and unchanged normal mode/mobile390. All evidence synthetic/private local artifacts.

Publish type-checked compiled single-site package with source/hash manifest to codex/dgc-deploy; owner redeploys, enters real fee/evidence and confirms personally. No live financial write, mail or host deploy is performed here.
