-- CreateTable
CREATE TABLE "input_document_receipts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "source_document_id" UUID NOT NULL,
    "input_contract_id" UUID NOT NULL,
    "input_partner_id" UUID NOT NULL,
    "output_partner_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "reference" VARCHAR(120) NOT NULL,
    "document_date" DATE,
    "request_id" UUID NOT NULL,
    "request_digest" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_document_receipts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "input_document_receipts"
 ADD CONSTRAINT "input_document_kind_check" CHECK ("kind" IN ('INPUT_RECON_SIGNED','INPUT_INVOICE_SIGNED')),
 ADD CONSTRAINT "input_document_period_check" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 ADD CONSTRAINT "input_document_digest_check" CHECK ("request_digest" ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT "input_document_distinct_source_check" CHECK ("document_id" <> "source_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "input_document_receipts_document_id_key" ON "input_document_receipts"("document_id");

-- CreateIndex
CREATE INDEX "input_document_receipts_company_id_input_partner_id_period_idx" ON "input_document_receipts"("company_id", "input_partner_id", "period");

-- CreateIndex
CREATE INDEX "input_document_receipts_company_id_source_document_id_kind_idx" ON "input_document_receipts"("company_id", "source_document_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "input_document_receipts_company_id_request_id_key" ON "input_document_receipts"("company_id", "request_id");

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_document_id_fkey" FOREIGN KEY ("company_id", "document_id") REFERENCES "documents"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_source_document_id_fkey" FOREIGN KEY ("company_id", "source_document_id") REFERENCES "documents"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_input_contract_id_fkey" FOREIGN KEY ("company_id", "input_contract_id") REFERENCES "contracts"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_input_partner_id_fkey" FOREIGN KEY ("company_id", "input_partner_id") REFERENCES "partners"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_document_receipts" ADD CONSTRAINT "input_document_receipts_company_id_output_partner_id_fkey" FOREIGN KEY ("company_id", "output_partner_id") REFERENCES "partners"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
