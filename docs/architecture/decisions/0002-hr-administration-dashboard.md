# ADR-0002: HR Administration Dashboard First Slice

Status: accepted for the first administrative prototype.

## Context

The first administrative experience needs to support HR as the primary operator.

The existing product documents define workflow ownership, hierarchy assignments, immutable workflow versions, and operational transparency, but they do not define the administrative home experience.

The dashboard must be useful for operations without becoming a decorative analytics surface disconnected from the records HR manages.

## Decisions

- HR is the primary persona for the administrative console.
- The administrative home is workflow-operations focused rather than a general executive report.
- The default reporting window is the current calendar month.
- Dashboard metrics link to filtered worklists instead of stopping at metric details.
- The first administrative navigation includes Overview, People, Workflows, Roles and pools, Requests, Audit log, and Settings.
- Workflow assignments are department-first, with an explicit per-employee override for exceptions.
- HR may create, simulate, validate, publish, and assign workflow versions.
- Workflow publication remains audited and subject to the existing draft-simulate-validate-publish lifecycle.
- The first implementation slice uses real PostgreSQL records for organizations, employees, hierarchy data, workflow templates and versions, authority roles and pools, and workflow assignments.
- Request and payment analytics may use clearly labeled seeded prototype data until the request domain tables are implemented.

## Consequences

The HR home must make workflow bottlenecks and routing health understandable while keeping direct paths to People and Workflows visible.

The data model must distinguish department defaults from employee overrides and resolve the effective assignment deterministically.

HR publication authority differs from the earlier baseline statement that only system administrators publish workflows.

That authority change must be enforced server-side and included in the audit model rather than implemented only as a UI affordance.

The first dashboard can be built before the complete reimbursement workflow exists, but its prototype metrics must not be presented as production payment truth.

## Follow-up

- Define the exact HR, system administrator, Finance, and executive permission matrix.
- Define the request and payment tables that will replace seeded operational analytics.
- Define workflow assignment effective dates and behavior when a department or employee override is removed.

## Implementation Notes

- The first slice models one administration role per employee. The schema keeps the many-to-many `employee_roles` table so multiple roles per employee can be supported later, but the store currently replaces the existing role on assignment.
- Role matching uses `roles.display_name` as the application vocabulary; `roles.code` remains a stable storage key for seeds and future references.
- Input limits on the command layer are name (max 120), scope (max 60), steps (max 15), and employee id (max 100).
- The dev-only PostgreSQL connection string is documented in the README and repeated as a fallback while the database provider module is still being introduced.
