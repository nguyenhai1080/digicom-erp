-- Add a transfer header; preserve all prior receipt rows/branches. No backfill/seed.
BEGIN;
CREATE TABLE invoice_receipt_groups (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 partner_id uuid NOT NULL, receipt_code text NOT NULL, request_id uuid NOT NULL, request_digest text NOT NULL,
 bank_reference text NOT NULL, payment_date date NOT NULL,
 gross_usd decimal(20,2) NOT NULL, bank_fee_usd decimal(20,2) NOT NULL,
 cash_currency varchar(3) NOT NULL, cash_amount decimal(20,2) NOT NULL, fx_rate decimal(20,4),
 bank_account text NOT NULL, note text NOT NULL, snapshot jsonb NOT NULL,
 document_id uuid, created_by_id uuid NOT NULL, created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,id), UNIQUE(company_id,request_id), UNIQUE(company_id,bank_reference), UNIQUE(company_id,receipt_code),
 FOREIGN KEY(company_id,partner_id) REFERENCES partners(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,document_id) REFERENCES documents(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,created_by_id) REFERENCES users(company_id,id) ON DELETE RESTRICT,
 CONSTRAINT invoice_receipt_group_amounts CHECK ((gross_usd>0 AND bank_fee_usd>=0 AND bank_fee_usd<gross_usd AND cash_amount>0 AND
  length(bank_reference)>=5 AND bank_reference=upper(btrim(bank_reference)) AND
  CASE WHEN cash_currency='USD' THEN fx_rate IS NULL AND cash_amount=gross_usd-bank_fee_usd
   WHEN cash_currency='VND' THEN fx_rate>0 AND cash_amount=round((gross_usd-bank_fee_usd)*fx_rate,0) ELSE false END) IS TRUE)
);
CREATE INDEX invoice_receipt_groups_partner_date ON invoice_receipt_groups(company_id,partner_id,payment_date);
ALTER TABLE invoice_payments ADD COLUMN receipt_group_id uuid;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_group_fk FOREIGN KEY(company_id,receipt_group_id) REFERENCES invoice_receipt_groups(company_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX invoice_payments_group_invoice_key ON invoice_payments(receipt_group_id,invoice_id);
ALTER TABLE invoice_payments DROP CONSTRAINT invoice_payments_positive;
ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_positive CHECK (
 CASE WHEN receipt_group_id IS NOT NULL THEN (
  allocation_currency='USD' AND allocation_amount>0 AND paid_usd=allocation_amount AND
  cash_currency IN ('USD','VND') AND cash_amount>=0 AND cash_account_id IS NULL AND document_id IS NULL AND
  historical_source->>'sourceKind'='DGC_GROUP_RECEIPT_ALLOCATION_V1' AND
  historical_source->>'groupId'=receipt_group_id::text AND NOT (historical_source ? 'bankFee') AND
  CASE WHEN cash_currency='USD' THEN paid_vnd IS NULL AND fx_rate IS NULL AND cash_amount=round(cash_amount,2)
   ELSE paid_vnd=cash_amount AND cash_amount=trunc(cash_amount) AND fx_rate>0 END
 ) IS TRUE
 ELSE receipt_group_id IS NULL AND CASE WHEN coalesce(historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false) THEN
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
 END
);
-- Deferred so all allocations/document/AR writes commit or roll back together.
CREATE FUNCTION check_invoice_receipt_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid uuid; g invoice_receipt_groups%ROWTYPE; n bigint; gross numeric; actual numeric; fee numeric;
BEGIN
 IF TG_TABLE_NAME='invoice_receipt_groups' THEN gid=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSE gid=CASE WHEN TG_OP='DELETE' THEN OLD.receipt_group_id ELSE NEW.receipt_group_id END;
  IF TG_OP='UPDATE' AND OLD.receipt_group_id IS DISTINCT FROM NEW.receipt_group_id THEN RAISE EXCEPTION 'Receipt allocation group cannot change'; END IF;
 END IF;
 IF gid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO g FROM invoice_receipt_groups WHERE id=gid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt group must remain present'; END IF;
 SELECT count(*),sum(p.allocation_amount),sum(p.cash_amount),sum((p.historical_source->>'feeShareUsd')::numeric)
 INTO n,gross,actual,fee FROM invoice_payments p WHERE p.receipt_group_id=gid;
 IF n<2 OR n>50 OR gross IS DISTINCT FROM g.gross_usd OR actual IS DISTINCT FROM g.cash_amount OR fee IS DISTINCT FROM g.bank_fee_usd
 OR EXISTS (SELECT 1 FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.receipt_group_id=gid AND
  (p.company_id<>g.company_id OR i.company_id<>g.company_id OR i.partner_id<>g.partner_id OR i.currency<>'USD' OR
   p.cash_currency<>g.cash_currency OR p.payment_date<>g.payment_date OR p.fx_rate IS DISTINCT FROM g.fx_rate OR
   p.historical_source->>'feeShareUsd' IS NULL OR (p.historical_source->>'feeShareUsd')::numeric<0 OR
   (p.historical_source->>'feeShareUsd')::numeric>p.allocation_amount))
 THEN RAISE EXCEPTION 'Receipt group allocation scope or totals mismatch'; END IF;
 IF g.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM documents d WHERE d.id=g.document_id AND d.company_id=g.company_id AND d.entity_type='InvoiceReceiptGroup' AND d.entity_id=g.id AND d.document_type='PAYMENT_SWIFT' AND d.status='ACTIVE')
 THEN RAISE EXCEPTION 'Receipt group document provenance mismatch'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_receipt_group_totals AFTER INSERT OR UPDATE OR DELETE ON invoice_receipt_groups DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_invoice_receipt_group();
CREATE CONSTRAINT TRIGGER invoice_receipt_allocation_totals AFTER INSERT OR UPDATE OR DELETE ON invoice_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_invoice_receipt_group();
COMMIT;
