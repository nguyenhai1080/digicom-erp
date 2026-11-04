-- The captured book can contain parallel Draft invoice options over the same
-- revenue. Preserve them, without weakening the native scope index or allowing
-- two operational issues of that revenue (checked atomically on issue).
ALTER TABLE invoice_scope_items ADD COLUMN captured_source boolean NOT NULL DEFAULT false;
DROP INDEX revenue_one_current_invoice_scope;
CREATE UNIQUE INDEX revenue_one_current_invoice_scope ON invoice_scope_items(revenue_id)
 WHERE is_current = true AND captured_source = false;
CREATE FUNCTION dgc_captured_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.captured_source AND NOT EXISTS(
  SELECT 1 FROM invoice_scopes s JOIN invoices i ON i.id=s.invoice_id
  JOIN revenues r ON r.id=NEW.revenue_id JOIN companies c ON c.id=NEW.company_id
  WHERE s.id=NEW.scope_id AND s.company_id=NEW.company_id AND i.company_id=NEW.company_id
   AND r.company_id=NEW.company_id AND c.company_code='DGC'
   AND i.snapshot->>'sourceKind'='DGC_CAPTURED_BOOK_V1'
   AND r.calculation_json->>'sourceKind'='DGC_CAPTURED_BOOK_V1'
 ) THEN RAISE EXCEPTION 'Captured scope requires DGC book provenance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dgc_captured_scope_guard BEFORE INSERT OR UPDATE ON invoice_scope_items
 FOR EACH ROW EXECUTE FUNCTION dgc_captured_scope_guard();
