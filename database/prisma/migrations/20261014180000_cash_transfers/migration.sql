-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "transfer_code" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "request_digest" TEXT NOT NULL,
    "source_account_id" UUID NOT NULL,
    "destination_account_id" UUID NOT NULL,
    "transfer_date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'POSTED',
    "document_id" UUID,
    "created_by_id" UUID NOT NULL,
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_transfers_company_id_transfer_date_id_idx" ON "cash_transfers"("company_id", "transfer_date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_company_id_request_id_key" ON "cash_transfers"("company_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transfers_company_id_transfer_code_key" ON "cash_transfers"("company_id", "transfer_code");

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_company_id_source_account_id_fkey" FOREIGN KEY ("company_id", "source_account_id") REFERENCES "cash_accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_company_id_destination_account_id_fkey" FOREIGN KEY ("company_id", "destination_account_id") REFERENCES "cash_accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfer_amount_positive" CHECK (amount > 0), ADD CONSTRAINT "cash_transfer_distinct_accounts" CHECK (source_account_id <> destination_account_id);
