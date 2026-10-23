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
