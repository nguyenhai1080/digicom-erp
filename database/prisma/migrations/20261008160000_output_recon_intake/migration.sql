CREATE TABLE output_recon_uploads (
 id UUID PRIMARY KEY,
 company_id UUID NOT NULL REFERENCES companies(id),
 upload_code TEXT NOT NULL,
 partner_id UUID NOT NULL REFERENCES partners(id),
 service_id UUID NOT NULL REFERENCES services(id),
 period VARCHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 business_key TEXT NOT NULL,
 attachment_id UUID NOT NULL REFERENCES attachments(id),
 status "ReconciliationStatus" NOT NULL DEFAULT 'UPLOADED',
 replacement_context JSONB,
 created_by_id UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(3) NOT NULL,
 CONSTRAINT output_recon_uploads_company_id_upload_code_key UNIQUE(company_id,upload_code)
);
CREATE INDEX output_recon_uploads_company_id_partner_id_service_id_period_idx ON output_recon_uploads(company_id,partner_id,service_id,period);
