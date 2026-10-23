CREATE TABLE "invoice_payments" (
 "id" UUID NOT NULL, "company_id" UUID NOT NULL, "invoice_id" UUID NOT NULL,
 "payment_code" TEXT NOT NULL, "request_id" UUID NOT NULL, "request_digest" TEXT NOT NULL,
 "payment_date" DATE NOT NULL, "paid_usd" DECIMAL(20,2) NOT NULL, "paid_vnd" DECIMAL(20,0) NOT NULL,
 "fx_rate" DECIMAL(20,4) NOT NULL, "swift_no" TEXT NOT NULL, "bank_account" TEXT NOT NULL,
 "payment_method" TEXT NOT NULL, "note" TEXT NOT NULL, "document_id" UUID,
 "approved_by_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "invoice_payments_positive" CHECK (paid_usd>0 AND paid_vnd>0 AND fx_rate>0),
 CONSTRAINT "invoice_payments_company_id_invoice_id_fkey" FOREIGN KEY ("company_id","invoice_id") REFERENCES "invoices"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "invoice_payments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT,
 CONSTRAINT "invoice_payments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "invoice_payments_company_id_request_id_key" ON "invoice_payments"("company_id","request_id");
CREATE UNIQUE INDEX "invoice_payments_company_id_payment_code_key" ON "invoice_payments"("company_id","payment_code");
CREATE INDEX "invoice_payments_company_id_invoice_id_payment_date_idx" ON "invoice_payments"("company_id","invoice_id","payment_date");
