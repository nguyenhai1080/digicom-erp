-- ERP Core Web 0005: Service reconciliation, revenue, and invoice-scope constraints.
-- Apply after Prisma creates the tables/enums for this pack.

ALTER TABLE reconciliations
  ADD CONSTRAINT reconciliations_period_chk
  CHECK (period_end >= period_start),
  ADD CONSTRAINT reconciliations_ocr_confidence_chk
  CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1));

ALTER TABLE reconciliation_items
  ADD CONSTRAINT reconciliation_items_period_chk
  CHECK (period_end >= period_start),
  ADD CONSTRAINT reconciliation_items_gross_revenue_chk
  CHECK (gross_revenue >= 0),
  ADD CONSTRAINT reconciliation_items_partner_share_rate_chk
  CHECK (partner_share_rate IS NULL OR (partner_share_rate >= 0 AND partner_share_rate <= 1)),
  ADD CONSTRAINT reconciliation_items_company_share_rate_chk
  CHECK (company_share_rate IS NULL OR (company_share_rate >= 0 AND company_share_rate <= 1)),
  ADD CONSTRAINT reconciliation_items_wht_rate_chk
  CHECK (wht_rate IS NULL OR (wht_rate >= 0 AND wht_rate <= 1)),
  ADD CONSTRAINT reconciliation_items_tax_rate_chk
  CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1));

ALTER TABLE commercial_term_snapshots
  ADD CONSTRAINT commercial_term_snapshot_partner_share_rate_chk
  CHECK (partner_share_rate IS NULL OR (partner_share_rate >= 0 AND partner_share_rate <= 1)),
  ADD CONSTRAINT commercial_term_snapshot_company_share_rate_chk
  CHECK (company_share_rate IS NULL OR (company_share_rate >= 0 AND company_share_rate <= 1)),
  ADD CONSTRAINT commercial_term_snapshot_wht_rate_chk
  CHECK (wht_rate IS NULL OR (wht_rate >= 0 AND wht_rate <= 1)),
  ADD CONSTRAINT commercial_term_snapshot_tax_rate_chk
  CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 1));

ALTER TABLE revenues
  ADD CONSTRAINT revenues_period_chk
  CHECK (period_end >= period_start),
  ADD CONSTRAINT revenues_gross_amount_chk
  CHECK (gross_amount >= 0);

ALTER TABLE invoice_scopes
  ADD CONSTRAINT invoice_scopes_period_chk
  CHECK (period_end >= period_start);

CREATE UNIQUE INDEX IF NOT EXISTS recon_one_current_per_group
  ON reconciliations (logical_group_id)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_item_one_current_business_scope
  ON reconciliation_items (company_id, business_scope_key, period_start, period_end)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_one_current_per_group
  ON revenues (logical_group_id)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS revenue_one_current_business_scope
  ON revenues (company_id, business_scope_key, period_start, period_end)
  WHERE is_current = TRUE
    AND status NOT IN ('CANCELLED', 'SUPERSEDED');

CREATE UNIQUE INDEX IF NOT EXISTS invoice_scope_one_current_per_group
  ON invoice_scopes (logical_group_id)
  WHERE is_current = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_scope_one_current_scope_key
  ON invoice_scopes (company_id, scope_key, period_start, period_end)
  WHERE is_current = TRUE
    AND status NOT IN ('CANCELLED', 'SUPERSEDED');

CREATE UNIQUE INDEX IF NOT EXISTS revenue_one_current_invoice_scope
  ON invoice_scope_items (revenue_id)
  WHERE is_current = TRUE;
