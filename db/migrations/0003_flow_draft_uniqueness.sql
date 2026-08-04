-- Enforce the duplicate-draft rule at the database level: at most one draft
-- flow per (organization, name, scope), matching the command-layer check.
-- Concurrent seed runs or races between the duplicate check and the INSERT
-- now fail loudly instead of silently creating duplicates.

CREATE UNIQUE INDEX idx_flows_org_name_scope_draft
  ON flows (organization_id, name, scope)
  WHERE status = 'draft';
