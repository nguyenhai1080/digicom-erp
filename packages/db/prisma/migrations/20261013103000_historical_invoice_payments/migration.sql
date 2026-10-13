ALTER TABLE "invoice_payments"
  ALTER COLUMN "paid_vnd" DROP NOT NULL,
  ALTER COLUMN "fx_rate" DROP NOT NULL,
  ADD COLUMN "allocation_amount" DECIMAL(20,2),
  ADD COLUMN "cash_currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  ADD COLUMN "cash_amount" DECIMAL(20,2),
  ADD COLUMN "historical_source" JSONB;

-- Preserve DGC's existing USD allocation / actual VND receipt distinction.
UPDATE "invoice_payments" SET
  "allocation_amount" = CASE WHEN "allocation_currency" = 'VND' THEN "paid_vnd" ELSE "paid_usd" END,
  "cash_amount" = "paid_vnd";
ALTER TABLE "invoice_payments"
  ALTER COLUMN "allocation_amount" SET NOT NULL,
  ALTER COLUMN "cash_amount" SET NOT NULL;

ALTER TABLE "invoice_payments" DROP CONSTRAINT "invoice_payments_positive";
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_positive" CHECK (
 allocation_amount > 0 AND cash_amount > 0 AND
 allocation_currency IN ('USD','VND') AND cash_currency IN ('USD','VND') AND
 ((allocation_currency = 'USD' AND paid_usd = allocation_amount) OR
  (allocation_currency = 'VND' AND paid_usd = 0 AND allocation_amount = trunc(allocation_amount))) AND
 (cash_currency <> 'VND' OR cash_amount = trunc(cash_amount)) AND
 CASE WHEN historical_source IS NULL THEN
  cash_currency = 'VND' AND paid_vnd IS NOT NULL AND fx_rate IS NOT NULL AND
  paid_vnd = cash_amount AND paid_vnd > 0 AND fx_rate > 0 AND
  ((allocation_currency = 'USD' AND paid_usd > 0) OR
   (allocation_currency = 'VND' AND allocation_amount = paid_vnd AND fx_rate = 1))
 ELSE
  jsonb_typeof(historical_source) = 'object' AND historical_source ? 'reference' AND
  jsonb_typeof(historical_source->'reference') = 'string' AND
  length(historical_source->>'reference') >= 10 AND
  ((cash_currency = 'USD' AND paid_vnd IS NULL) OR
   (cash_currency = 'VND' AND paid_vnd IS NOT NULL AND paid_vnd = cash_amount)) AND
  CASE WHEN allocation_currency = cash_currency THEN allocation_amount = cash_amount
   WHEN allocation_currency = 'VND' THEN fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount * fx_rate,0)
   ELSE fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount / fx_rate,2)
  END
 END
);
