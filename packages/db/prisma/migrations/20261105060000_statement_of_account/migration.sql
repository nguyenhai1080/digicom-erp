-- CreateTable
CREATE TABLE "statements_of_account" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "statement_number" TEXT NOT NULL,
    "as_of" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB NOT NULL,
    "request_id" UUID NOT NULL,
    "request_digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statements_of_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "statements_of_account_document_id_key" ON "statements_of_account"("document_id");

-- CreateIndex
CREATE INDEX "statements_of_account_company_id_partner_id_created_at_idx" ON "statements_of_account"("company_id", "partner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "statements_of_account_company_id_document_id_key" ON "statements_of_account"("company_id", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "statements_of_account_company_id_statement_number_key" ON "statements_of_account"("company_id", "statement_number");

-- CreateIndex
CREATE UNIQUE INDEX "statements_of_account_company_id_request_id_key" ON "statements_of_account"("company_id", "request_id");

-- AddForeignKey
ALTER TABLE "statements_of_account" ADD CONSTRAINT "statements_of_account_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements_of_account" ADD CONSTRAINT "statements_of_account_company_id_partner_id_fkey" FOREIGN KEY ("company_id", "partner_id") REFERENCES "partners"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements_of_account" ADD CONSTRAINT "statements_of_account_company_id_document_id_fkey" FOREIGN KEY ("company_id", "document_id") REFERENCES "documents"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

