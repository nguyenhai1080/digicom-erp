ALTER TYPE "ContractStatus" ADD VALUE 'SUSPENDED';
ALTER TABLE contracts
 ADD COLUMN dgc_direction TEXT,
 ADD COLUMN revenue_share_rate DECIMAL(9,6),
 ADD COLUMN fixed_fee DECIMAL(20,4),
 ADD COLUMN tax_rate DECIMAL(9,6),
 ADD COLUMN billing_cycle TEXT,
 ADD COLUMN owner_email TEXT,
 ADD COLUMN attachment_url TEXT,
 ADD COLUMN created_by TEXT,
 ADD COLUMN updated_by TEXT;
ALTER TABLE contract_services ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE contract_services ADD COLUMN dgc_status TEXT;
ALTER TABLE contracts ADD CONSTRAINT dgc_contract_rates_chk CHECK (
 (revenue_share_rate IS NULL OR revenue_share_rate BETWEEN 0 AND 1) AND
 (tax_rate IS NULL OR tax_rate BETWEEN 0 AND 1) AND
 (fixed_fee IS NULL OR fixed_fee >= 0));
ALTER TABLE contracts ADD CONSTRAINT dgc_contract_direction_chk CHECK (dgc_direction IS NULL OR dgc_direction IN ('Input','Output','Other'));
