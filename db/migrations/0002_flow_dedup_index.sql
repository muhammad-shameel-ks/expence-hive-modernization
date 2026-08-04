-- Support the duplicate-draft lookup used by the admin command layer and seed:
-- WHERE name = $1 AND organization_id = $2 (optionally AND status = 'draft').

CREATE INDEX idx_flows_org_name_status
  ON flows (organization_id, name, status);
