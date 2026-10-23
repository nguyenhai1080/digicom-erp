-- Extend source-row provenance for the rollback-only revenue mapping rehearsal.
-- No financial rows, state changes or backfill are performed by this migration.
ALTER TABLE "dgc_import_links" DROP CONSTRAINT "dgc_import_links_target_model_check";
ALTER TABLE "dgc_import_links" ADD CONSTRAINT "dgc_import_links_target_model_check"
 CHECK (target_model IN ('service','partner','contract','contractService','revenue'));
