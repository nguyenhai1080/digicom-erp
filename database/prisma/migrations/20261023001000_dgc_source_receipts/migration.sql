-- Preserve captured receipt precision. No backfill, source approval or cash posting.
ALTER TABLE invoice_payments
 ALTER COLUMN paid_vnd TYPE decimal(30,12),
 ALTER COLUMN cash_amount TYPE decimal(30,12),
 ALTER COLUMN fx_rate TYPE decimal(30,12),
 ALTER COLUMN approved_by_id DROP NOT NULL;

ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_source_approver CHECK (
 CASE WHEN coalesce(historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false)
 THEN approved_by_id IS NULL AND cash_account_id IS NULL
 ELSE approved_by_id IS NOT NULL END
);
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
  CASE WHEN allocation_currency = cash_currency THEN allocation_amount = cash_amount
   WHEN allocation_currency = 'VND' THEN fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount * fx_rate,0)
   ELSE fx_rate IS NOT NULL AND fx_rate > 0 AND allocation_amount = round(cash_amount / fx_rate,2)
  END
 END) IS TRUE END
);

CREATE FUNCTION dgc_source_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_source dgc_import_rows%ROWTYPE; v_header dgc_import_rows%ROWTYPE; v_invoice invoices%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN
  IF coalesce(OLD.historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false) THEN RAISE EXCEPTION 'Imported source receipts are immutable'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (coalesce(OLD.historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false) OR coalesce(NEW.historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false))
 AND (to_jsonb(OLD)-'document_id') IS DISTINCT FROM (to_jsonb(NEW)-'document_id') THEN
  RAISE EXCEPTION 'Imported source receipts are immutable; no approval or cash conversion';
 END IF;
 IF coalesce(NEW.historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1',false) THEN
  IF NOT EXISTS(SELECT 1 FROM companies WHERE id=NEW.company_id AND company_code='DGC') THEN RAISE EXCEPTION 'Source receipts require DGC'; END IF;
  SELECT * INTO STRICT v_source FROM dgc_import_rows WHERE company_id=NEW.company_id
   AND snapshot_hash=NEW.historical_source->>'snapshotHash' AND sheet_name='52_INVOICE_PAYMENT'
   AND sheet_id=(NEW.historical_source->'source'->>'sheetId')::integer
   AND source_row=(NEW.historical_source->'source'->>'sourceRow')::integer
   AND legacy_id=NEW.payment_code AND row_hash=NEW.historical_source->'source'->>'rowHash';
  SELECT * INTO STRICT v_header FROM dgc_import_rows WHERE company_id=NEW.company_id
   AND snapshot_hash=v_source.snapshot_hash AND sheet_name='48_INVOICE_HEADER'
   AND sheet_id=(NEW.historical_source->'invoiceSource'->>'sheetId')::integer
   AND source_row=(NEW.historical_source->'invoiceSource'->>'sourceRow')::integer
   AND row_hash=NEW.historical_source->'invoiceSource'->>'rowHash';
  SELECT * INTO STRICT v_invoice FROM invoices WHERE company_id=NEW.company_id AND id=NEW.invoice_id;
  IF NOT ((NEW.historical_source->>'capturedRowJson')::jsonb=v_source.payload
   AND v_source.payload->'values'->>'Invoice_ID'=v_header.legacy_id
   AND v_source.payload->'values'->>'Invoice_Number'=v_header.payload->'values'->>'Invoice_Number'
   AND v_source.payload->'values'->>'Partner_ID'=v_header.payload->'values'->>'Partner_ID'
   AND v_header.payload->'values'->>'Currency'='USD'
   AND v_invoice.currency='USD' AND v_invoice.invoice_number=v_header.payload->'values'->>'Invoice_Number'
   AND v_invoice.snapshot->>'snapshotHash'=v_source.snapshot_hash
   AND v_invoice.snapshot->'source'->>'rowHash'=v_header.row_hash
   AND v_invoice.snapshot->'source'->>'sourceRow'=v_header.source_row::text
   AND NEW.paid_usd=(v_source.payload->'values'->>'Paid_Amount_USD')::numeric
   AND NEW.paid_vnd=(v_source.payload->'values'->>'Paid_Amount_VND')::numeric
   AND NEW.fx_rate=(v_source.payload->'values'->>'Payment_FX_Rate')::numeric
   AND v_source.payload->'cells'->'Payment_Date'->'effectiveFormat'->'numberFormat'->>'type' IN ('DATE','DATE_TIME')
   AND NEW.payment_date=DATE '1899-12-30'+floor((v_source.payload->'values'->>'Payment_Date')::numeric)::integer
   AND NEW.swift_no=coalesce(v_source.payload->'values'->>'Swift_No','')
   AND NEW.bank_account=coalesce(v_source.payload->'values'->>'Bank_Account','')
   AND NEW.payment_method=coalesce(v_source.payload->'values'->>'Payment_Method','')
   AND NEW.note=coalesce(v_source.payload->'values'->>'Note','')) IS TRUE THEN
   RAISE EXCEPTION 'Source receipt differs from pinned staged evidence or Invoice';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dgc_source_receipt_guard BEFORE INSERT OR UPDATE OR DELETE ON invoice_payments FOR EACH ROW EXECUTE FUNCTION dgc_source_receipt_guard();

CREATE FUNCTION dgc_source_receipt_no_cash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='INVOICE_RECEIPT' AND EXISTS(SELECT 1 FROM invoice_payments WHERE company_id=NEW.company_id AND id=NEW.source_id AND historical_source->>'sourceKind'='DGC_SOURCE_RECEIPT_V1') THEN
  RAISE EXCEPTION 'Imported source receipts never post cash';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dgc_source_receipt_no_cash BEFORE INSERT OR UPDATE ON cash_entries FOR EACH ROW EXECUTE FUNCTION dgc_source_receipt_no_cash();

ALTER TABLE dgc_import_links DROP CONSTRAINT dgc_import_links_target_model_check;
ALTER TABLE dgc_import_links ADD CONSTRAINT dgc_import_links_target_model_check CHECK (target_model IN ('service','partner','contract','contractService','revenue','invoice','accountReceivable','document','invoicePayment'));
