-- CreateTable
CREATE TABLE "input_reconciliations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "input_recon_code" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "source_revenue_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "output_partner_id" UUID NOT NULL,
    "output_contract_id" UUID NOT NULL,
    "input_partner_id" UUID NOT NULL,
    "input_contract_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "base_usd" DECIMAL(20,2) NOT NULL,
    "share_rate" DECIMAL(9,6) NOT NULL,
    "foreign_amount" DECIMAL(20,2) NOT NULL,
    "fx_rate" DECIMAL(20,8) NOT NULL,
    "local_amount" DECIMAL(20,2) NOT NULL,
    "tax_rate" DECIMAL(9,6) NOT NULL,
    "tax_amount" DECIMAL(20,2) NOT NULL,
    "wht_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "payable_amount" DECIMAL(20,2) NOT NULL,
    "source_digest" CHAR(64) NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "document_id" UUID,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "input_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_payables" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "input_recon_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "original_amount" DECIMAL(20,2) NOT NULL,
    "paid_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(20,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_payables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "input_reconciliations_company_id_period_input_partner_id_in_idx" ON "input_reconciliations"("company_id", "period", "input_partner_id", "input_contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "input_reconciliations_company_id_id_key" ON "input_reconciliations"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "input_reconciliations_company_id_input_recon_code_key" ON "input_reconciliations"("company_id", "input_recon_code");

-- CreateIndex
CREATE UNIQUE INDEX "input_reconciliations_company_id_source_revenue_id_key" ON "input_reconciliations"("company_id", "source_revenue_id");

-- CreateIndex
CREATE INDEX "account_payables_company_id_status_currency_idx" ON "account_payables"("company_id", "status", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "account_payables_company_id_input_recon_id_key" ON "account_payables"("company_id", "input_recon_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_company_id_id_key" ON "documents"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "partners_company_id_id_key" ON "partners"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "services_company_id_id_key" ON "services"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_company_id_id_key" ON "contracts"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "revenues_company_id_id_key" ON "revenues"("company_id", "id");

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_source_revenue_id_fkey" FOREIGN KEY ("company_id", "source_revenue_id") REFERENCES "revenues"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_service_id_fkey" FOREIGN KEY ("company_id", "service_id") REFERENCES "services"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_input_partner_id_fkey" FOREIGN KEY ("company_id", "input_partner_id") REFERENCES "partners"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_output_partner_id_fkey" FOREIGN KEY ("company_id", "output_partner_id") REFERENCES "partners"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_input_contract_id_fkey" FOREIGN KEY ("company_id", "input_contract_id") REFERENCES "contracts"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_output_contract_id_fkey" FOREIGN KEY ("company_id", "output_contract_id") REFERENCES "contracts"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "input_reconciliations" ADD CONSTRAINT "input_reconciliations_company_id_document_id_fkey" FOREIGN KEY ("company_id", "document_id") REFERENCES "documents"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "account_payables" ADD CONSTRAINT "account_payables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "account_payables" ADD CONSTRAINT "account_payables_company_id_input_recon_id_fkey" FOREIGN KEY ("company_id", "input_recon_id") REFERENCES "input_reconciliations"("company_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE input_reconciliations ADD CONSTRAINT input_recon_domain CHECK (
 currency IN ('USD','VND') AND status IN ('DRAFT','GENERATED','APPROVED')
 AND base_usd>0 AND share_rate>0 AND share_rate<=1 AND fx_rate>0
 AND tax_rate>=0 AND tax_rate<=1 AND foreign_amount>0 AND local_amount>0
 AND tax_amount>=0 AND wht_amount=0 AND payable_amount=local_amount-tax_amount-wht_amount
 AND payable_amount>0 AND (currency<>'USD' OR fx_rate=1)
 AND (status<>'APPROVED' OR (approved_by_id IS NOT NULL AND approved_at IS NOT NULL))
);
ALTER TABLE account_payables ADD CONSTRAINT payable_domain CHECK (
 currency IN ('USD','VND') AND original_amount>0 AND paid_amount>=0
 AND paid_amount<=original_amount AND outstanding_amount=original_amount-paid_amount
 AND status IN ('OPEN','PARTIALLY_PAID','PAID')
);
