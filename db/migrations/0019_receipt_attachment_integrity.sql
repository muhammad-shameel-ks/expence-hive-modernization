-- Receipt uploads are all-or-nothing (ADR-0005): the server buffers the
-- upload, computes SHA-256 over the buffer, and stores the digest, byte
-- size, and upload time with the attachment row, then recomputes and
-- compares the digest before serving a download. Pre-existing attachment
-- rows are placeholder metadata whose storage keys reference no stored
-- object; under all-or-nothing semantics they are served as unavailable,
-- so downloads report not-found.

ALTER TABLE claim_attachments ADD COLUMN content_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE claim_attachments ADD COLUMN size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE claim_attachments ADD COLUMN uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now();
