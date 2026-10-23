-- PostgreSQL constraints/indexes for 0004 Contract Execution + Billing.
ALTER TABLE contracts
  ADD CONSTRAINT contract_not_own_parent_chk
  CHECK (parent_contract_id IS NULL OR parent_contract_id <> id);

ALTER TABLE contracts
  ADD CONSTRAINT contracts_date_order_chk
  CHECK (expiry_date IS NULL OR effective_date IS NULL OR expiry_date >= effective_date);

ALTER TABLE contract_billing_schedules
  ADD CONSTRAINT billing_percentage_chk
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 1));

ALTER TABLE contract_billing_schedules
  ADD CONSTRAINT billing_amount_non_negative_chk
  CHECK (scheduled_amount >= 0 AND invoiced_amount >= 0 AND remaining_billable >= 0);

ALTER TABLE contract_billing_schedules
  ADD CONSTRAINT billing_balance_chk
  CHECK (invoiced_amount <= scheduled_amount AND remaining_billable <= scheduled_amount);

ALTER TABLE contract_billing_schedules
  ADD CONSTRAINT billing_recurrence_dates_chk
  CHECK (recurrence_end_date IS NULL OR recurrence_start_date IS NULL OR recurrence_end_date >= recurrence_start_date);

ALTER TABLE contract_billing_schedules
  ADD CONSTRAINT billing_fixed_fx_rate_chk
  CHECK (fixed_fx_rate IS NULL OR fixed_fx_rate > 0);

ALTER TABLE contract_payment_schedules
  ADD CONSTRAINT payment_schedule_percentage_chk
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 1));

ALTER TABLE contract_payment_schedules
  ADD CONSTRAINT payment_schedule_amount_chk
  CHECK (scheduled_amount >= 0);

CREATE UNIQUE INDEX project_one_primary_main_contract
  ON project_contracts (project_id)
  WHERE is_primary = TRUE AND role = 'MAIN';
