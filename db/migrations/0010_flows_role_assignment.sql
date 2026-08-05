-- A Flow is assigned to exactly one Role (the entry point it routes) rather
-- than a free-text department scope. Publishing a Flow for a Role supersedes
-- any Flow previously published for that Role; the superseded Flow is kept
-- as 'archived' rather than deleted so in-flight requests that already
-- captured its version are unaffected.

DROP INDEX idx_flows_org_name_scope_draft;

ALTER TABLE flows ADD COLUMN role_id TEXT REFERENCES roles(id);
ALTER TABLE flows DROP COLUMN scope;

ALTER TABLE flows DROP CONSTRAINT flows_status_check;
ALTER TABLE flows ADD CONSTRAINT flows_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

CREATE UNIQUE INDEX idx_flows_org_name_role_draft
  ON flows (organization_id, name, role_id)
  WHERE status = 'draft';

CREATE UNIQUE INDEX idx_flows_role_published
  ON flows (role_id)
  WHERE status = 'published';

CREATE INDEX idx_flows_role ON flows (role_id);
