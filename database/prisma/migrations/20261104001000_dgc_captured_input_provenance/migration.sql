-- Captured Generated input reconciliations retain source provenance. This does
-- not approve them, create AP, change historical cash or enable old importers.
ALTER TABLE dgc_import_links DROP CONSTRAINT dgc_import_links_target_model_check;
ALTER TABLE dgc_import_links ADD CONSTRAINT dgc_import_links_target_model_check
 CHECK (target_model IN ('service','partner','contract','contractService','revenue','invoice','accountReceivable','document','invoicePayment','inputReconciliation'));
