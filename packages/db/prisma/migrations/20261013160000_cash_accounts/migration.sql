-- AlterTable
ALTER TABLE "invoice_payments" ADD COLUMN     "cash_account_id" UUID;

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "opening_date" DATE NOT NULL,
    "opening_balance" DECIMAL(20,2) NOT NULL,
    "balance" DECIMAL(20,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_entries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "entry_code" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "balance_after" DECIMAL(20,2) NOT NULL,
    "source_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_accounts_company_id_status_currency_idx" ON "cash_accounts"("company_id", "status", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_company_id_id_key" ON "cash_accounts"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_company_id_account_code_key" ON "cash_accounts"("company_id", "account_code");

-- CreateIndex
CREATE INDEX "cash_entries_company_id_cash_account_id_entry_date_id_idx" ON "cash_entries"("company_id", "cash_account_id", "entry_date", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_entries_company_id_entry_code_key" ON "cash_entries"("company_id", "entry_code");

-- CreateIndex
CREATE UNIQUE INDEX "cash_entries_company_id_kind_source_id_key" ON "cash_entries"("company_id", "kind", "source_id");

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_company_id_cash_account_id_fkey" FOREIGN KEY ("company_id", "cash_account_id") REFERENCES "cash_accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_company_id_cash_account_id_fkey" FOREIGN KEY ("company_id", "cash_account_id") REFERENCES "cash_accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE cash_accounts ADD CONSTRAINT cash_account_values CHECK (
 kind IN ('BANK','CASH') AND currency IN ('VND','USD') AND status IN ('ACTIVE','INACTIVE')
 AND opening_balance>=0 AND balance>=0 AND (currency<>'VND' OR (opening_balance=trunc(opening_balance) AND balance=trunc(balance)))
);
ALTER TABLE cash_entries ADD CONSTRAINT cash_entry_values CHECK (
 direction IN ('IN','OUT') AND currency IN ('VND','USD') AND amount>=0
 AND (kind='OPENING' OR amount>0) AND (currency<>'VND' OR amount=trunc(amount))
);
