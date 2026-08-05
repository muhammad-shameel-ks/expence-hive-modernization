-- employees.department was a free-text field with no admin management.
-- Back it with the departments table added in 0008: convert every distinct
-- existing (organization, department) string into a departments row, then
-- point each employee at it.

INSERT INTO departments (id, organization_id, name)
SELECT DISTINCT
  'dept-' || e.organization_id || '-' || lower(regexp_replace(e.department, '[^a-zA-Z0-9]+', '-', 'g')),
  e.organization_id,
  e.department
FROM employees e
ON CONFLICT (organization_id, name) DO NOTHING;

ALTER TABLE employees ADD COLUMN department_id TEXT REFERENCES departments(id);

UPDATE employees e
SET department_id = d.id
FROM departments d
WHERE d.organization_id = e.organization_id AND d.name = e.department;

ALTER TABLE employees DROP COLUMN department;

