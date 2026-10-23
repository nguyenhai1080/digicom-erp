BEGIN;

-- Rename the original company in place: every company_id relation stays valid.
-- Never merge two tenants if GST has already been created separately.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE company_code = 'DEFAULT')
     AND EXISTS (SELECT 1 FROM companies WHERE company_code = 'GST') THEN
    RAISE EXCEPTION 'Both DEFAULT and GST companies exist; review tenant data before renaming';
  END IF;

  UPDATE companies
  SET company_code = 'GST',
      company_name = 'CÔNG TY CỔ PHẦN CÔNG NGHỆ GST VIỆT NAM',
      updated_at = CURRENT_TIMESTAMP
  WHERE company_code = 'DEFAULT';

  UPDATE companies
  SET company_name = 'CÔNG TY CỔ PHẦN CÔNG NGHỆ GST VIỆT NAM',
      updated_at = CURRENT_TIMESTAMP
  WHERE company_code = 'GST';
END $$;

COMMIT;
