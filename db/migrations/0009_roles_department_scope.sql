-- Roles become Superadmin-managed and department-scoped instead of the
-- hard-coded AdminRole union in src/server/admin/ports.ts.
-- department_id is nullable: an organization-wide role (e.g. Superadmin)
-- is not scoped to any single department.

ALTER TABLE roles ADD COLUMN department_id TEXT REFERENCES departments(id);
ALTER TABLE roles ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- The original migration made `code` globally unique across every
-- organization. Scope it to the organization instead, matching how every
-- other seeded table in this schema is scoped.
ALTER TABLE roles DROP CONSTRAINT roles_code_key;
CREATE UNIQUE INDEX idx_roles_org_code ON roles (organization_id, code);
