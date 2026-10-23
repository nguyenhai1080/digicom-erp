-- Existing receipt rows retain USD allocation; no financial amounts are changed.
ALTER TABLE invoice_payments ADD COLUMN allocation_currency VARCHAR(3) NOT NULL DEFAULT 'USD';
ALTER TABLE invoice_payments DROP CONSTRAINT invoice_payments_positive;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_positive CHECK (
 paid_vnd > 0 AND fx_rate > 0 AND
 ((allocation_currency = 'USD' AND paid_usd > 0) OR
  (allocation_currency = 'VND' AND paid_usd = 0 AND fx_rate = 1))
);
