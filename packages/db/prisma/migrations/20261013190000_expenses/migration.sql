-- CreateTable
CREATE TABLE "expenses" (
    "direction" VARCHAR(3) NOT NULL DEFAULT 'OUT',
    "purpose" TEXT NOT NULL DEFAULT 'Khác',
    "project_label" TEXT NOT NULL DEFAULT '',
    "nature" VARCHAR(20) NOT NULL DEFAULT 'ACTUAL',
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "cash_account_id" UUID NOT NULL,
    "expense_code" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "request_digest" TEXT NOT NULL,
    "expense_date" DATE NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "note" TEXT NOT NULL,
    "document_id" UUID,
    "created_by_id" UUID NOT NULL,
    "posted_by_id" UUID,
    "posted_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_history" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_digest" TEXT NOT NULL,
    "source_file" TEXT NOT NULL,
    "source_references" JSONB NOT NULL,
    "source_data" JSONB NOT NULL,
    "transaction_date" DATE NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "project_label" TEXT NOT NULL,
    "nature" VARCHAR(20) NOT NULL,
    "imported_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_company_id_expense_date_status_idx" ON "expenses"("company_id", "expense_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_company_id_expense_code_key" ON "expenses"("company_id", "expense_code");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_company_id_request_id_key" ON "expenses"("company_id", "request_id");

-- CreateIndex
CREATE INDEX "cash_history_company_id_transaction_date_kind_idx" ON "cash_history"("company_id", "transaction_date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "cash_history_company_id_source_key_key" ON "cash_history"("company_id", "source_key");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_cash_account_id_fkey" FOREIGN KEY ("company_id", "cash_account_id") REFERENCES "cash_accounts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE expenses ADD CONSTRAINT expenses_values CHECK (amount > 0 AND currency IN ('USD','VND') AND direction IN ('IN','OUT') AND status IN ('DRAFT','POSTED','VOIDED') AND nature IN ('ACTUAL','INTERNAL','NON_EXPENSE','UNKNOWN') AND (currency <> 'VND' OR amount = trunc(amount)));
ALTER TABLE cash_history ADD CONSTRAINT cash_history_values CHECK (currency IN ('USD','VND') AND direction IN ('IN','OUT') AND kind IN ('FLOW','OPENING') AND (kind='OPENING' OR amount>0) AND nature IN ('ACTUAL','INTERNAL','NON_EXPENSE','UNKNOWN'));
ALTER TABLE cash_history ADD CONSTRAINT cash_history_company_fkey FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT;
