-- Keep organization-scoped administration lookups efficient as records grow.

CREATE INDEX idx_flows_organization ON flows (organization_id);
CREATE INDEX idx_employee_roles_employee ON employee_roles (employee_id);
