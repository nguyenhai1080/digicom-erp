-- ERP Core Web 0003: Project pipeline, quotation and approval invariants.

ALTER TABLE projects
  ADD CONSTRAINT projects_probability_chk
  CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1));

ALTER TABLE projects
  ADD CONSTRAINT projects_progress_chk
  CHECK (progress_percent >= 0 AND progress_percent <= 1);

ALTER TABLE projects
  ADD CONSTRAINT projects_expected_dates_chk
  CHECK (expected_end_date IS NULL OR expected_start_date IS NULL OR expected_end_date >= expected_start_date);

ALTER TABLE quotations
  ADD CONSTRAINT quotations_non_negative_amounts_chk
  CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0);

ALTER TABLE quotations
  ADD CONSTRAINT quotations_validity_chk
  CHECK (valid_until IS NULL OR valid_until >= quotation_date);

CREATE UNIQUE INDEX IF NOT EXISTS quotation_one_current_per_group
  ON quotations (logical_group_id)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS project_one_current_quotation
  ON quotations (project_id)
  WHERE is_current = TRUE
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED');

CREATE UNIQUE INDEX IF NOT EXISTS project_one_accepted_quotation
  ON quotations (project_id)
  WHERE status = 'ACCEPTED';

CREATE UNIQUE INDEX IF NOT EXISTS project_one_current_qualification
  ON project_qualifications (project_id)
  WHERE is_current = TRUE;
