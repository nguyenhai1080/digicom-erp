# ERP Core Web

Technical Build Pack **v0.6.11** for the ERP Core Web rebuild targeting Vibehost + PostgreSQL 16.

**Scope:** inherit the existing ERP DGC functionality and business rules in full, then add Projects. The current release is a partial technical foundation, not a completed migration of DGC. The donor is the exact deployed Apps Script version 61. See the [inheritance baseline and gap analysis](docs/DGC_INHERITANCE_BASELINE.md); it supersedes the earlier project-first roadmap.

## Staging deployment bundles

API root `/` and `/api/v1/health` check the database. The web UI proxies authenticated
requests to `API_BASE_URL`. Login and company-scoped project execution are implemented:
partner/project creation, budget revisions, milestone progress/return/cancellation and audited cost
approval/cancellation. Formal contract acceptance remains pending. See
[execution commands](docs/EXECUTION_COMMANDS.md) and [authentication setup](docs/AUTH_ACCESS.md).
Project-scoped PDF upload/download and contract draft/internal review are available;
see [project evidence and contracts](docs/PROJECT_EVIDENCE_CONTRACTS.md).
Partner profiles follow the complete current DGC form, with search, view and audited editing;
see [DGC partner profiles](docs/DGC_PARTNER_PROFILES.md).
API `APP_URL` must identify the UI origin for login/CSRF checks.

Build upload bundles from this repository on Windows:

```powershell
./scripts/package-staging.ps1 -Target all
```

The output is under ignored `artifacts/staging/`. API bundles include the local DB
package, npm lockfile and Prisma migration source, so Vibehost can build from one
directory without losing pnpm workspace dependencies. Deploy these archives to
the existing API/Web projects; do not create extra database instances.

API startup applies existing migrations. Set `ERP_SEED_ON_START=true` for the
initial staging seed, then remove it after logs show `Seed verified`. Seed uses
upserts and preserves existing company fields. It creates the company, permissions,
ADMIN role and sequences; it does not create a login user. The previously printed
random bootstrap token was never stored or used for authentication and is removed.

The root `Dockerfile` builds the API from the complete pnpm workspace. For GitHub
deployment, select `develop`, leave the subdirectory empty, and use this Dockerfile.
For the UI GitHub project, select the same `develop` branch with subdirectory
`apps/web`; its Dockerfile uses the standalone npm lockfile and serves the health
proxy with `API_BASE_URL` pointing to the API. The root pnpm lock remains canonical
for local monorepo development. The UI remains a separate deployment. Runtime credentials must be supplied by the
host; `.dockerignore` excludes local secrets and upload archives.

For staging persistence acceptance, declare `/app/storage` as a persistent directory
in Vibehost, set `STORAGE_ROOT=/app/storage` and `ERP_STORAGE_PROBE=true`, then deploy
twice. The first startup logs `Storage probe: created`; the second must log
`preserved` with exactly the same ID and creation time. Set the probe flag to
`false` after acceptance. It exposes no HTTP endpoint and writes only a test marker.

Before seeding, take a data backup of the database attached to the API. Keep a
daily backup schedule and verify a download/restore independently before production.

## v0.6.1 API workspace entrypoint fix

`@erp/db` exports TypeScript source under the `development` condition and compiled
JavaScript/declarations under the default condition. API dev enables that condition
through `tsx` and loads the root `.env`. No database package build is needed for dev.
The `NodeNext` configurations and `@erp/db` imports remain unchanged; Prisma scripts
and migrations are unchanged. API and DB declare `@types/node` as a dev dependency
so their TypeScript builds recognize Node globals; the pnpm lockfile is updated.

From the repository root (Node.js 22 LTS or the existing Node.js 24 installation):

```powershell
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
pnpm --filter @erp/db exec prisma validate
pnpm db:generate
pnpm --filter @erp/api dev
```

Keep the API running and check in a second PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health | ConvertTo-Json
```

Expected response: `{"status":"ok","service":"erp-core-api","database":"connected"}`.
PostgreSQL must be running and the root `.env` must contain the correct `DATABASE_URL`.
Use the port from `.env` if `PORT` differs from 3000. The already applied baseline
migration and seed do not need to be rerun for this package resolution patch.

For a compiled API, build its workspace dependencies first:

```powershell
pnpm --filter @erp/api... build
# Supply DATABASE_URL through the deployment environment, or locally:
pnpm --filter @erp/api start:local
```

Deployment startup remains `pnpm --filter @erp/api start` with environment variables
provided by the host. Do not set `NODE_OPTIONS=--conditions=development` for compiled
production startup; it would select TypeScript source.

## Implemented baseline

- pnpm monorepo
- React + Vite web shell
- Fastify API shell + DB health check
- Prisma/PostgreSQL foundation and identity models
- Commercial Master: Partner, Service, Contract
- Project Pipeline: opportunity, qualification, activity
- Quotation revision chain and quotation items
- Generic approval workflow/request/action engine
- Contract execution: project-contract mapping, activation conditions, billing/payment schedules and addendum impact
- Service Business: reconciliation revision chain, OCR/correction snapshots, commercial-term snapshot, revenue and invoice scope
- Shared permissions/enums
- Storage abstraction baseline
- Local PostgreSQL 16 compose file
- Vibehost-ready environment baseline

## Schema packs included

- `0001_foundation_identity`
- `0002_commercial_master`
- `0003_project_pipeline_quotation`
- `0004_contract_execution_billing`
- `0005_service_reconciliation_revenue`

PostgreSQL-only constraints that Prisma cannot express directly are stored as SQL companion files in `packages/db/prisma/`.

## Next gate

Before implementing `0006_project_execution_cost`, run the **Local Integration Gate**: install dependencies, start PostgreSQL 16, run `prisma format/validate/generate`, migrate a blank database, seed, and verify both API health and the web shell. See `docs/LOCAL_GITHUB_VIBEHOST_ROADMAP.md`.

## Validation note

The source is structured for `prisma format`, `prisma validate` and `prisma generate`. If the current execution environment cannot reach the npm registry, install dependencies locally or on staging before running compiler validation.
