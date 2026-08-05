-- Allow multiple active published flows concurrently across departments and roles
DROP INDEX IF EXISTS idx_flows_role_published;
CREATE INDEX IF NOT EXISTS idx_flows_role_published ON flows (role_id) WHERE status = 'published';
