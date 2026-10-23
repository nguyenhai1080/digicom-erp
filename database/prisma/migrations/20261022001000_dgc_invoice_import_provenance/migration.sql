-- Source-row provenance for isolated, rollback-only Invoice/AR restore trials.
-- No backfill, financial posting, approval, status changes or cash movements.
ALTER TABLE "dgc_import_links" DROP CONSTRAINT "dgc_import_links_target_model_check";
ALTER TABLE "dgc_import_links" ADD CONSTRAINT "dgc_import_links_target_model_check"
 CHECK (target_model IN ('service','partner','contract','contractService','revenue','invoice','accountReceivable'));
