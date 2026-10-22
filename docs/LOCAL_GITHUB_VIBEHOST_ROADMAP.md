# ERP Core Web - Local -> GitHub -> Vibehost Roadmap

**DGC independent checkout, 22/10/2026:** current status and next steps are in [DGC roadmap status](handover/DGC_ROADMAP_STATUS_20261022.md). Deployment/release entries below describe upstream history; they do not authorize pushing DGC to GST remotes/services.

## Owner scope correction — 2026-10-08 (takes precedence)

**ERP Core inherits the complete ERP DGC functionality and business behavior; Projects are the additional domain.** The previous project-first sequence below is historical, not the current implementation priority. A schema pack or green health check is not DGC business parity.

The exact donor deployment is Apps Script **version 61**, retrieved read-only (24 source files). The current ERP Core release has only partial inherited functionality. First close the source-grounded DGC gaps, including service contracts, reconciliation/OCR, monthly revenue, invoices, payments, AR/AP, SOA, reporting and administration. Then complete and integrate the additional Projects lifecycle.

See [DGC inheritance baseline and revised work order](DGC_INHERITANCE_BASELINE.md), [full function/source inventory](DGC_SOURCE_INVENTORY.json) and [data declarations](DGC_DATA_CATALOG.json). Keep raw donor source in ignored artifacts/dgc-reference. This audit does not trigger a deployment or import business data.

## Current gate

2026-10-07: Local Integration, GitHub baseline, staging API health, migration and
seed have passed. Phase 4 acceptance has passed. Backup download and isolated local restore
passed (DEFAULT, 80 permissions, 14 sequences, ADMIN with 80 permissions, one
applied migration). Storage marker survived Vibehost redeployment. Pushes to
`develop` automatically deployed both API and UI and passed health. Phase 5 is
underway: 0006 Project Execution + Cost now has a tested data foundation. See
`STAGING_INFRASTRUCTURE_ACCEPTANCE.md`.

Schema packs implemented in source:

- 0001 Foundation & Identity
- 0002 Commercial Master
- 0003 Project Pipeline + Quotation
- 0004 Contract Execution + Billing
- 0005 Service Reconciliation + Revenue + Invoice Scope
- 0006 Project Execution + Cost — schema, migration, seed, integrity tests and
  initial authenticated execution workspace; formal acceptance and UAT remain.

0006 local verification: migration from the restored baseline and from an empty
database passed; 20 invalid writes were rejected; repeated migration/seed and
the workspace build passed. New seed baseline: 92 permissions, 16 sequences.
See `schema/0006-project-execution-cost.md` for scope and remaining runtime work.

v0.6.7 adds authentication, persisted sessions, runtime role/company checks and
the authenticated project read screen. Local integration tests passed 52 checks.
2026-10-08: staging API v14 and UI v7 run v0.6.7 with company code GST and legal
name CÔNG TY CỔ PHẦN CÔNG NGHỆ GST VIỆT NAM. Post-change backup restore verified
four migrations, 92 permissions, 16 sequences and the preserved ADMIN account.
The owner confirmed login with GST and existing credentials. See `AUTH_ACCESS.md`
for access validation.

v0.6.8 implements the initial execution workspace: partner/project creation,
budget revisions, milestone progress/submission, draft cost/approval/cancellation
and exact per-currency totals. 51 command checks and 52 auth checks passed.
2026-10-08: staging API v15 and UI v9 built source 4a338f8c and passed public
health checks; UI displays v0.6.8. Pre-release managed data backup succeeded.
Formal acceptance, contract/evidence workflows and GST business UAT remain.
See `EXECUTION_COMMANDS.md`.

v0.6.9 adds reasoned milestone return/cancellation and an informational acceptance
checklist. Approved linked costs prevent milestone cancellation; cancelled
milestones prevent draft-cost approval. 81 execution checks and 52 auth checks
passed. Formal contract/evidence acceptance and GST business UAT remain pending.
Staging API v16 / UI v11 deployed source a47329c5 and passed public health checks;
the public UI serves v0.6.9. Pre-release PostgreSQL backup succeeded (220 KB).

v0.6.10 adds private project PDF upload/download and primary contract
draft/document/submission/internal approval/return. 199 local checks passed.
Next: billing-plan reconciliation and activation conditions, signed evidence,
contract activation/project execution stage, then formal milestone acceptance.
See `PROJECT_EVIDENCE_CONTRACTS.md`. Business UAT remains with the GST owner.
Staging API v18 / UI v12 deployed source 01f8eb8c and passed public health checks;
UI displays v0.6.10. Managed PostgreSQL backup succeeded (220 KB).

**Do not continue to 0006 until the Local Integration Gate passes.**

## Phase 1 - Local Integration Gate (Windows)

Target folder:

```text
D:\Projects\ERP-CORE-WEB
```

Prerequisites:

- Git
- Node.js 22 LTS
- Corepack / pnpm
- Docker Desktop
- VS Code (recommended)

Verify:

```powershell
node -v
npm -v
git --version
docker --version
corepack enable
pnpm -v
```

Install source and dependencies:

```powershell
cd D:\Projects\ERP-CORE-WEB
pnpm install
Copy-Item .env.example .env
```

Start PostgreSQL 16:

```powershell
docker compose -f docker-compose.dev.yml up -d
docker ps
```

Prisma compiler gate:

```powershell
pnpm --filter @erp/db exec prisma format
pnpm --filter @erp/db exec prisma validate
pnpm db:generate
```

If any Prisma error appears, stop and fix it before migration or deployment.

Then run migration and seed:

```powershell
pnpm db:migrate
pnpm db:seed
```

Optional DB inspection:

```powershell
pnpm --filter @erp/db exec prisma studio
```

Start API:

```powershell
pnpm --filter @erp/api dev
```

Health gate:

```text
http://localhost:3000/api/v1/health
```

Expected database status: `connected`.

Start web in a second terminal:

```powershell
pnpm --filter @erp/web dev
```

Open:

```text
http://localhost:5173
```

### Local Integration Gate PASS criteria

- pnpm install succeeds
- prisma format succeeds
- prisma validate succeeds
- prisma generate succeeds
- blank PostgreSQL migration succeeds
- seed succeeds
- API health reports DB connected
- web shell loads

## Phase 2 - GitHub

Create repository:

```text
erp-core-web
```

Branch model:

```text
feature/* -> develop -> Vibehost staging
                    \
                     main -> Vibehost production (later)
```

Initial commands:

```powershell
git init
git branch -M main
git add .
git commit -m "chore: bootstrap ERP Core Web baseline"
git remote add origin https://github.com/<user>/erp-core-web.git
git push -u origin main
git checkout -b develop
git push -u origin develop
```

Do not commit `.env` or secrets.

## Phase 3 - Vibehost Staging

Create only after Local Integration Gate PASS.

Create:

1. ERP Core Staging PostgreSQL
2. ERP Core Staging App

Recommended initial DB:

```text
PostgreSQL 16
CPU 0.3 core
RAM 512 MB
pgvector OFF
```

Connect Vibehost application to GitHub branch:

```text
develop
```

Suggested environment variables:

```text
NODE_ENV=production
DATABASE_URL=<Vibehost PostgreSQL connection string>
SESSION_SECRET=<long random secret>
APP_URL=<staging URL>
DEFAULT_COMPANY_CODE=DEFAULT
STORAGE_PROVIDER=local
LOG_LEVEL=info
```

Do not finalize `STORAGE_ROOT` until the persistence test passes.

## Phase 4 - Staging Infrastructure Acceptance

After first successful staging deployment:

1. API health test
2. Database migration test
3. Seed test
4. Persistent storage redeploy test
5. Database backup/download/restore test
6. GitHub `develop` auto-deploy test

If local application files do not survive redeploy, switch the storage adapter to S3-compatible object storage before production document usage.

## Phase 5 - Continue business packs

Only after Local + Staging baseline is stable:

- 0006 Project Execution + Cost
- 0007 Invoice + AR/AP
- 0008 Payment + Allocation + Ledger
- 0009 Closure + Liquidation
- 0010 Reporting + Snapshots

Development loop:

```text
Local feature branch
-> local tests
-> GitHub feature branch
-> merge develop
-> Vibehost staging
-> UAT
```

## Phase 6 - Production

Production is created only after:

- 0010 completed
- financial integrity tests pass
- RBAC tests pass
- storage persistence strategy is confirmed
- DB backup + restore test passes
- RC/UAT passes

Production branch:

```text
main
```

Release flow:

```text
develop
-> release/v1.0.0-rc.1
-> UAT
-> main
-> tag v1.0.0
-> Vibehost production
```

## v0.6.11 — DGC partner profile parity

- Read the current DGC application and complete partner modal, including invoice address.
- Add the 14 source fields, four directions and seven categories, with a dedicated partner list/search/view/edit page.
- Add five nullable profile columns; preserve existing partner records and GST ownership.
- 273 integration checks passed; local browser create/edit and invoice address persistence verified with fake records.
- Successful pre-release PostgreSQL backup: 222 KB. See [field mapping and validation](DGC_PARTNER_PROFILES.md).
- Next: partner UAT, then resume billing conditions, contract activation and formal project acceptance.

Staging v0.6.11 verified: API provider v20 / UI v13, source 03fdee55; both HTTP 200, five migrations current, API database connected. Authenticated partner UAT remains for the owner; local creation/editing used fake data only.
