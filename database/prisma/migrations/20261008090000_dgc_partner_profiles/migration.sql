-- Additive profile fields; retain existing partners, codes, contacts and bank accounts.
ALTER TABLE "partners"
  ADD COLUMN "country_name" TEXT,
  ADD COLUMN "partner_category" TEXT,
  ADD COLUMN "invoice_recipient" TEXT,
  ADD COLUMN "invoice_email" TEXT,
  ADD COLUMN "billing_address" TEXT;
ALTER TABLE "partners" ADD CONSTRAINT "partners_category_check"
  CHECK ("partner_category" IS NULL OR "partner_category" IN ('Telco','Content Provider','Aggregator','Vendor','Customer','Outsourcing','Other'));
