CREATE TABLE invoice_document_links (
 company_id UUID NOT NULL,
 invoice_id UUID NOT NULL,
 document_id UUID NOT NULL,
 kind VARCHAR(30) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,invoice_id,document_id),
 CONSTRAINT invoice_document_links_kind CHECK(kind IN ('SOA','APPROVAL_PACKAGE')),
 CONSTRAINT invoice_document_links_invoice_fk FOREIGN KEY(company_id,invoice_id) REFERENCES invoices(company_id,id) ON DELETE RESTRICT,
 CONSTRAINT invoice_document_links_document_fk FOREIGN KEY(company_id,document_id) REFERENCES documents(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX invoice_document_links_company_document_idx ON invoice_document_links(company_id,document_id);
