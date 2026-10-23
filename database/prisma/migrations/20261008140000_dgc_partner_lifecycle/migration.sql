ALTER TABLE partners ADD COLUMN partner_key TEXT,
  ADD COLUMN contact_name TEXT,
  ADD COLUMN created_by TEXT,
  ADD COLUMN updated_by TEXT;
UPDATE partners SET partner_key = partner_code;
ALTER TABLE partners ALTER COLUMN partner_key SET NOT NULL;
CREATE UNIQUE INDEX partners_company_id_partner_key_key ON partners(company_id, partner_key);
ALTER TABLE partners ALTER COLUMN status SET DEFAULT 'ACTIVE'::"PartnerStatus";
UPDATE sequences SET prefix='PRT' WHERE sequence_name='PARTNER' AND prefix='PTR';
