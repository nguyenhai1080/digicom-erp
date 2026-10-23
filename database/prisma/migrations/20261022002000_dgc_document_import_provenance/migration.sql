-- Provenance for rollback-only historical document/reference shape trials.
-- No backfill, operational activation, source approval or financial posting.
ALTER TABLE "dgc_import_links" DROP CONSTRAINT "dgc_import_links_target_model_check";
ALTER TABLE "dgc_import_links" ADD CONSTRAINT "dgc_import_links_target_model_check"
 CHECK (target_model IN ('service','partner','contract','contractService','revenue','invoice','accountReceivable','document'));
