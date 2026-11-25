-- Preserve all existing receipt branches and values. Allow explicit gross/net USD fee evidence only.
BEGIN;
ALTER TABLE invoice_payments DROP CONSTRAINT invoice_payments_positive;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_positive CHECK (
 CASE WHEN coalesce(historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false) THEN
  (allocation_currency='USD' AND cash_currency='VND' AND paid_usd=allocation_amount AND paid_vnd=cash_amount
   AND allocation_amount>0 AND cash_amount>0 AND fx_rate>0
   AND historical_source->>'historicalCashPosting'='false' AND historical_source->>'localApprovalCreated'='false') IS TRUE
 ELSE
 (allocation_amount > 0 AND cash_amount > 0 AND
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
  jsonb_typeof(historical_source->'reference') = 'string' AND length(historical_source->>'reference') >= 10 AND
  ((cash_currency = 'USD' AND paid_vnd IS NULL) OR
   (cash_currency = 'VND' AND paid_vnd IS NOT NULL AND paid_vnd = cash_amount)) AND
  CASE WHEN historical_source ? 'bankFee' THEN (
   historical_source->>'sourceKind'='DGC_LEDGER_ONLY_RECEIPT_V1' AND allocation_currency='USD' AND
   jsonb_typeof(historical_source->'bankFee')='object' AND
   historical_source->'bankFee'->>'currency'='USD' AND
   historical_source->'bankFee'->>'formula'='NET_AFTER_BANK_FEE_V1' AND
   historical_source->'bankFee'->>'cashCurrency'=cash_currency AND
   (historical_source->'bankFee'->>'amount')::numeric > 0 AND
   (historical_source->'bankFee'->>'amount')::numeric = round((historical_source->'bankFee'->>'amount')::numeric,2) AND
   (historical_source->'bankFee'->>'amount')::numeric < allocation_amount AND
   (historical_source->'bankFee'->>'grossUsd')::numeric = allocation_amount AND
   (historical_source->'bankFee'->>'netUsd')::numeric = allocation_amount-(historical_source->'bankFee'->>'amount')::numeric AND
   (historical_source->'bankFee'->>'netCashAmount')::numeric = cash_amount AND
   CASE WHEN cash_currency='USD' THEN
    fx_rate IS NULL AND cash_amount=allocation_amount-(historical_source->'bankFee'->>'amount')::numeric
   ELSE fx_rate IS NOT NULL AND fx_rate>0 AND
    cash_amount=round((allocation_amount-(historical_source->'bankFee'->>'amount')::numeric)*fx_rate,0)
   END
  ) IS TRUE
   WHEN allocation_currency = cash_currency THEN allocation_amount = cash_amount
   WHEN allocation_currency = 'VND' THEN fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount * fx_rate,0)
   ELSE fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount / fx_rate,2)
  END
 END) IS TRUE END
);

COMMIT;
