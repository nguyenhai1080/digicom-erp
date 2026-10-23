CREATE TABLE "invoices" (
 "id" UUID NOT NULL, "company_id" UUID NOT NULL, "invoice_number" TEXT NOT NULL,
 "business_key" TEXT NOT NULL, "revision_no" INTEGER NOT NULL DEFAULT 1,
 "is_current" BOOLEAN NOT NULL DEFAULT TRUE, "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
 "partner_id" UUID NOT NULL, "period" VARCHAR(7) NOT NULL, "invoice_mode" "InvoiceMode" NOT NULL,
 "service_id" UUID, "invoice_date" DATE NOT NULL, "due_date" DATE NOT NULL,
 "currency" VARCHAR(3) NOT NULL DEFAULT 'USD', "revenue_amount" DECIMAL(20,4) NOT NULL,
 "wht_amount" DECIMAL(20,4) NOT NULL, "payable_amount" DECIMAL(20,4) NOT NULL,
 "paid_amount" DECIMAL(20,4) NOT NULL DEFAULT 0, "snapshot" JSONB NOT NULL,
 "document_id" UUID NOT NULL, "created_by_id" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "invoices_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "invoices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "invoices_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "invoices_amounts_check" CHECK ("revenue_amount">=0 AND "wht_amount">=0 AND "payable_amount">0 AND "paid_amount">=0),
 CONSTRAINT "invoices_dates_check" CHECK ("due_date">="invoice_date"),
 CONSTRAINT "invoices_status_check" CHECK ("status" IN ('DRAFT','APPROVED','ISSUED','SUPERSEDED','CANCELLED','PAID','PARTIALLY_PAID'))
);
CREATE UNIQUE INDEX "invoices_company_id_invoice_number_key" ON "invoices"("company_id","invoice_number");
CREATE UNIQUE INDEX "invoices_company_id_business_key_revision_no_key" ON "invoices"("company_id","business_key","revision_no");
CREATE INDEX "invoices_company_id_partner_id_period_idx" ON "invoices"("company_id","partner_id","period");
CREATE UNIQUE INDEX "invoice_one_current_business_key" ON "invoices"("company_id","business_key") WHERE "is_current" AND "status" NOT IN ('CANCELLED','SUPERSEDED');
ALTER TABLE "invoice_scopes" ADD COLUMN "invoice_id" UUID;
ALTER TABLE "invoice_scopes" ADD CONSTRAINT "invoice_scopes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- The original 0005 constraint pack was a reference SQL file, not an applied
-- migration. Enforce the finance uniqueness rules in the executable migration.
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_item_one_current_business_scope" ON "reconciliation_items" ("company_id","business_scope_key","period_start","period_end") WHERE "is_current" = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "revenue_one_current_business_scope" ON "revenues" ("company_id","business_scope_key","period_start","period_end") WHERE "is_current" = TRUE AND "status" NOT IN ('CANCELLED','SUPERSEDED');
CREATE UNIQUE INDEX IF NOT EXISTS "revenue_one_current_invoice_scope" ON "invoice_scope_items" ("revenue_id") WHERE "is_current" = TRUE;
