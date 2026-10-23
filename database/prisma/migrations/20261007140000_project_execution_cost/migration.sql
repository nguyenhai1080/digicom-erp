BEGIN;
-- CreateEnum
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SUBMITTED', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectCostStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectCostCategory" AS ENUM ('LABOR', 'MATERIAL', 'SUBCONTRACT', 'TRAVEL', 'OVERHEAD', 'OTHER');

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "milestone_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "planned_start" DATE,
    "planned_end" DATE,
    "actual_start" DATE,
    "actual_end" DATE,
    "progress_percent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "accepted_at" TIMESTAMP(3),
    "acceptance_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cost_budgets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "reason" TEXT,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_cost_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_cost_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "milestone_id" UUID,
    "budget_id" UUID,
    "cost_code" TEXT NOT NULL,
    "cost_date" DATE NOT NULL,
    "category" "ProjectCostCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "status" "ProjectCostStatus" NOT NULL DEFAULT 'DRAFT',
    "source_ref" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_cost_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_milestones_company_id_project_id_status_idx" ON "project_milestones"("company_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_company_id_project_id_id_key" ON "project_milestones"("company_id", "project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_milestones_project_id_milestone_code_key" ON "project_milestones"("project_id", "milestone_code");

-- CreateIndex
CREATE INDEX "project_cost_budgets_company_id_project_id_is_current_idx" ON "project_cost_budgets"("company_id", "project_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "project_cost_budgets_company_id_project_id_currency_id_key" ON "project_cost_budgets"("company_id", "project_id", "currency", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_cost_budgets_project_id_currency_revision_no_key" ON "project_cost_budgets"("project_id", "currency", "revision_no");

-- CreateIndex
CREATE INDEX "project_cost_entries_company_id_project_id_status_cost_date_idx" ON "project_cost_entries"("company_id", "project_id", "status", "cost_date");

-- CreateIndex
CREATE INDEX "project_cost_entries_company_id_project_id_milestone_id_idx" ON "project_cost_entries"("company_id", "project_id", "milestone_id");

-- CreateIndex
CREATE INDEX "project_cost_entries_company_id_project_id_currency_budget__idx" ON "project_cost_entries"("company_id", "project_id", "currency", "budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_cost_entries_company_id_cost_code_key" ON "project_cost_entries"("company_id", "cost_code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_company_id_id_key" ON "projects"("company_id", "id");

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_budgets" ADD CONSTRAINT "project_cost_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_budgets" ADD CONSTRAINT "project_cost_budgets_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_entries" ADD CONSTRAINT "project_cost_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_entries" ADD CONSTRAINT "project_cost_entries_company_id_project_id_fkey" FOREIGN KEY ("company_id", "project_id") REFERENCES "projects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_entries" ADD CONSTRAINT "project_cost_entries_company_id_project_id_milestone_id_fkey" FOREIGN KEY ("company_id", "project_id", "milestone_id") REFERENCES "project_milestones"("company_id", "project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_cost_entries" ADD CONSTRAINT "project_cost_entries_company_id_project_id_currency_budget_fkey" FOREIGN KEY ("company_id", "project_id", "currency", "budget_id") REFERENCES "project_cost_budgets"("company_id", "project_id", "currency", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Included verbatim in the 0006 migration; do not apply separately after migrate deploy.
ALTER TABLE project_milestones
  ADD CONSTRAINT milestone_progress_chk CHECK (progress_percent BETWEEN 0 AND 1),
  ADD CONSTRAINT milestone_planned_dates_chk CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
  ADD CONSTRAINT milestone_actual_dates_chk CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start),
  ADD CONSTRAINT milestone_acceptance_chk CHECK (status <> 'ACCEPTED' OR
    (accepted_at IS NOT NULL AND actual_end IS NOT NULL AND progress_percent = 1 AND
     acceptance_ref IS NOT NULL AND length(trim(acceptance_ref)) > 0));

ALTER TABLE project_cost_budgets
  ADD CONSTRAINT budget_amount_chk CHECK (amount >= 0),
  ADD CONSTRAINT budget_revision_chk CHECK (revision_no > 0),
  ADD CONSTRAINT budget_currency_chk CHECK (currency ~ '^[A-Z]{3}$');

CREATE UNIQUE INDEX project_one_current_cost_budget
  ON project_cost_budgets (company_id, project_id, currency) WHERE is_current = TRUE;

ALTER TABLE project_cost_entries
  ADD CONSTRAINT cost_amount_chk CHECK (amount >= 0),
  ADD CONSTRAINT cost_currency_chk CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT cost_approval_chk CHECK (status <> 'APPROVED' OR approved_at IS NOT NULL);

-- Approved budgets are snapshots. A revision may retire the current version,
-- but cannot rewrite or delete historical financial values.
CREATE FUNCTION protect_project_cost_budget() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Budget snapshots cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'is_current') IS DISTINCT FROM (to_jsonb(OLD) - 'is_current') THEN
    RAISE EXCEPTION 'Create a new budget revision instead of editing a snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_cost_budget_snapshot_guard BEFORE UPDATE OR DELETE ON project_cost_budgets
  FOR EACH ROW EXECUTE FUNCTION protect_project_cost_budget();

CREATE FUNCTION protect_approved_project_cost() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'CANCELLED') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Finalized cost entries cannot be deleted' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status', 'updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'updated_at']) OR
       (OLD.status = 'APPROVED' AND NEW.status NOT IN ('APPROVED', 'CANCELLED')) OR
       (OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED') THEN
      RAISE EXCEPTION 'Cancel and replace a finalized cost instead of editing its history' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_cost_history_guard BEFORE UPDATE OR DELETE ON project_cost_entries
  FOR EACH ROW EXECUTE FUNCTION protect_approved_project_cost();

COMMIT;
