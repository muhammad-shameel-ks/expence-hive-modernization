-- Departments become Superadmin-managed data instead of a free-text employee field.

CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX idx_departments_org_name ON departments (organization_id, name);
