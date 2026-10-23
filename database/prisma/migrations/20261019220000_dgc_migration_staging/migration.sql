-- Private staging/provenance only. No financial records are generated here.
CREATE TABLE dgc_import_snapshots (
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
 snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
 source_spreadsheet_id TEXT NOT NULL,
 source_metadata JSONB NOT NULL,
 row_count INTEGER NOT NULL CHECK (row_count >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (company_id, snapshot_hash)
);
CREATE TABLE dgc_import_rows (
 company_id UUID NOT NULL,
 snapshot_hash TEXT NOT NULL,
 sheet_id INTEGER NOT NULL,
 sheet_name TEXT NOT NULL,
 source_row INTEGER NOT NULL CHECK (source_row >= 2),
 legacy_id TEXT NOT NULL,
 row_hash TEXT NOT NULL CHECK (row_hash ~ '^[0-9a-f]{64}$'),
 payload JSONB NOT NULL,
 PRIMARY KEY (company_id, snapshot_hash, sheet_id, source_row),
 FOREIGN KEY (company_id, snapshot_hash) REFERENCES dgc_import_snapshots(company_id, snapshot_hash) ON DELETE RESTRICT
);
CREATE INDEX dgc_import_source_lookup ON dgc_import_rows(company_id, sheet_id, legacy_id);
CREATE TABLE dgc_import_links (
 company_id UUID NOT NULL,
 source_spreadsheet_id TEXT NOT NULL,
 sheet_id INTEGER NOT NULL,
 source_row INTEGER NOT NULL,
 legacy_id TEXT NOT NULL,
 row_hash TEXT NOT NULL,
 snapshot_hash TEXT NOT NULL,
 target_model TEXT NOT NULL CHECK (target_model IN ('service','partner','contract','contractService')),
 target_id UUID NOT NULL,
 target_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (company_id, source_spreadsheet_id, sheet_id, source_row, legacy_id),
 UNIQUE (company_id, target_model, target_id),
 FOREIGN KEY (company_id, snapshot_hash, sheet_id, source_row) REFERENCES dgc_import_rows(company_id, snapshot_hash, sheet_id, source_row) ON DELETE RESTRICT
);
