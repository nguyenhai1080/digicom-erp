ALTER TABLE invoices ADD COLUMN issued_at TIMESTAMP(3), ADD COLUMN issued_by_id UUID;
CREATE UNIQUE INDEX invoices_company_id_id_key ON invoices(company_id,id);
CREATE TABLE account_receivables (
 id UUID PRIMARY KEY,
 company_id UUID NOT NULL,
 invoice_id UUID NOT NULL,
 original_amount DECIMAL(20,4) NOT NULL,
 paid_amount DECIMAL(20,4) NOT NULL DEFAULT 0,
 outstanding_amount DECIMAL(20,4) NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL,
 CONSTRAINT account_receivables_invoice_fk FOREIGN KEY(company_id,invoice_id) REFERENCES invoices(company_id,id),
 CONSTRAINT account_receivables_nonnegative CHECK(original_amount >= 0 AND paid_amount >= 0 AND outstanding_amount >= 0),
 CONSTRAINT account_receivables_balance CHECK(original_amount = paid_amount + outstanding_amount)
);
CREATE UNIQUE INDEX account_receivables_company_id_invoice_id_key ON account_receivables(company_id,invoice_id);
CREATE INDEX account_receivables_company_id_status_idx ON account_receivables(company_id,status);
