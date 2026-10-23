ALTER TYPE "RecordStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TABLE services ADD COLUMN service_key TEXT,
  ADD COLUMN dgc_category TEXT,
  ADD COLUMN keyword TEXT,
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN created_by TEXT,
  ADD COLUMN updated_by TEXT;
UPDATE services SET service_key = service_code;
ALTER TABLE services ALTER COLUMN service_key SET NOT NULL;
CREATE UNIQUE INDEX services_company_id_service_key_key ON services(company_id, service_key);
ALTER TABLE services ADD CONSTRAINT services_dgc_category_check
  CHECK (dgc_category IS NULL OR dgc_category IN ('Basic','Application','Content','Utility','Other'));
