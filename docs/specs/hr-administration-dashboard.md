# HR Administration Dashboard and Workflow Foundation

> Status: **Superseded** (2026-08-06).
> Superseded by the role and user management spec, issue #39 (https://github.com/muhammad-shameel-ks/expence-hive-modernization/issues/39). HR is not a domain for this product: the hr-administrator and hr roles are removed, Superadmin is the only administrative identity, and the role model is the locked predefined catalog (Intern, Executive, Manager, Finance Head, Finance Executive) plus custom roles.
> The original content below is retained as a historical record.

Status: proposed implementation specification from the focused administrative grill session.

This specification covers the first administrative vertical slice.

It does not replace the broader ExpenseHive modernization specification or the approval workflow domain model.

## Problem Statement

HR needs a dependable administrative workspace for understanding workflow operations and maintaining the people and workflow configuration that produces those operations.

The current prototype has an employee-facing expense dashboard, but it has no administrative shell, no persistent organization and workflow records, and no way to assign a workflow to a department or employee.

If the dashboard is built only with mock data, its analytics can drift away from the people, roles, and workflow assignments that the real application must manage.

The first administrative slice therefore needs a real PostgreSQL foundation for users and workflow configuration while allowing request and payment analytics to remain seeded prototype data until those domains are implemented.

## Solution

Build an HR-focused administrative console with a workflow-operations Overview as its landing page.

The Overview will default to the current calendar month and show operational metrics that link to filtered worklists.

The console will include Overview, People, Workflows, Roles and pools, Requests, Audit log, and Settings sections.

The People and Workflows sections will be backed by PostgreSQL from the first implementation.

Workflow assignment will be department-first, with an explicit employee override for exceptions.

HR will be able to create, simulate, validate, publish, and assign workflow versions.

The dashboard will use a server-side read model so that real records and prototype request metrics can be clearly separated without allowing the browser to mutate business data directly.

## User Stories

1. As an HR operator, I want to open an administrative Overview, so that I can understand workflow operations without searching through individual records.

2. As an HR operator, I want the Overview to focus on workflow operations, so that bottlenecks and routing problems are visible before they become employee support issues.

3. As an HR operator, I want the Overview to default to the current calendar month, so that the initial numbers represent the current operational period.

4. As an HR operator, I want to see requests by workflow stage and status, so that I can identify where work is accumulating.

5. As an HR operator, I want to see aging or delayed workflow work, so that I can prioritize operational intervention.

6. As an HR operator, I want to see correction and skipped-stage counts, so that I can distinguish policy or data quality problems from ordinary workload.

7. As an HR operator, I want each concerning metric to open a filtered worklist, so that I can move from an insight to the records requiring attention.

8. As an HR operator, I want to filter workflow analytics by period, department, workflow, and status where the data supports it, so that I can investigate a specific operational segment.

9. As an HR operator, I want the Overview to link directly to People and Workflows, so that configuration work is available from the same operating context.

10. As an HR operator, I want to browse all employees in the organization, so that I can maintain the people who participate in ExpenseHive.

11. As an HR operator, I want to search and filter employees by name, email, department, active state, and workflow assignment, so that I can find records quickly.

12. As an HR operator, I want to see whether each employee has a manager assignment, so that missing hierarchy data can be corrected before it blocks routing.

13. As an HR operator, I want to see whether each employee inherits a department workflow or has an employee override, so that the effective policy is understandable.

14. As an HR operator, I want to assign an application manager to an employee, so that ExpenseHive rather than Microsoft Graph controls approval authority.

15. As an HR operator, I want to create and maintain departments, so that people and workflow defaults can be organized around the company structure.

16. As an HR operator, I want to see Graph profile or hierarchy suggestions separately from ExpenseHive assignments, so that suggestions do not silently authorize financial decisions.

17. As an HR operator, I want to refresh directory suggestions for an employee, so that profile information can be updated without overwriting application-managed authority.

18. As an HR operator, I want to create a workflow template for pre-spend permission or reimbursement, so that the two request types can have separate policies.

19. As an HR operator, I want to create a workflow draft, so that I can prepare a policy without affecting active requests.

20. As an HR operator, I want to add ordered approval, notification, Finance verification, and payment-completion nodes, so that the workflow matches the supported ExpenseHive path.

21. As an HR operator, I want to configure a node target as an application manager, approval role, approval pool, or named user, so that the workflow can represent the organization’s real authority structure.

22. As an HR operator, I want notification nodes not to block a workflow, so that communication does not become an accidental approval requirement.

23. As an HR operator, I want to simulate a workflow with a representative employee, form type, category, and amount, so that I can see the route before publication.

24. As an HR operator, I want the simulator to show target actors and fallback behavior, so that missing assignments are visible before a request uses the workflow.

25. As an HR operator, I want validation to flag missing targets, unreachable behavior, and invalid node order, so that an unsafe workflow cannot be published accidentally.

26. As an HR operator, I want a non-drag interaction path for workflow editing, so that configuration remains usable with a keyboard and on devices where drag and drop is inconvenient.

27. As an HR operator, I want to publish a validated workflow version, so that new requests can use an intentional policy.

28. As an HR operator, I want published workflow versions to be immutable, so that active requests retain the policy under which they started.

29. As an HR operator, I want to disable or restore workflow versions according to my authority, so that obsolete policies do not receive new requests without changing active requests.

30. As an HR operator, I want to assign a default workflow to a department, so that employees receive a predictable policy without individual configuration.

31. As an HR operator, I want to assign an explicit workflow override to one employee, so that legitimate exceptions do not require creating a new department.

32. As an HR operator, I want to see the effective workflow for an employee, so that department inheritance and employee overrides are not ambiguous.

33. As an HR operator, I want removing an employee override to restore department inheritance, so that exceptions can be safely retired.

34. As an HR operator, I want to manage approval roles, so that authority such as Finance or CEO is defined inside ExpenseHive.

35. As an HR operator, I want to manage approval pools and their active members, so that one eligible pool member can complete an ordinary pool stage.

36. As an HR operator, I want changes to roles, pools, managers, and workflow assignments audited, so that administrative authority remains accountable.

37. As an HR operator, I want to browse request records from the admin console, so that I can investigate the records represented by operational metrics.

38. As an HR operator, I want to browse the append-only audit log, so that I can understand who changed configuration and when.

39. As an HR operator, I want the interface to show when a metric is based on seeded prototype data, so that I do not mistake it for complete production payment reporting.

40. As a system administrator, I want HR publication and assignment actions to be authorized server-side, so that hiding or showing a button cannot grant authority.

41. As an unauthorized user, I want administrative routes to reject access, so that organization configuration and audit records are protected.

42. As a user on a small screen, I want the administrative console to reflow into an accessible layout, so that essential people, workflow, and status information remains usable.

43. As a keyboard user, I want navigation, filters, tables, workflow editing alternatives, and actions to be operable without a mouse, so that administration is not dependent on pointer interaction.

44. As a screen-reader user, I want metrics, filters, status labels, errors, and worklist links to have meaningful accessible names and relationships, so that the dashboard communicates its purpose and outcome.

## Implementation Decisions

### Application Boundary

- The administrative UI will be implemented in the existing Next.js App Router application.
- Protected server-side application commands remain the only mutation boundary for employees, departments, roles, pools, workflow drafts, publications, and assignments.
- Route handlers or equivalent protected server entrypoints will authenticate the current actor, authorize the action, validate input, and invoke the application command.
- The browser will receive read models and will not directly mutate PostgreSQL records.
- The existing development identity adapter remains local-only and will be used to exercise HR and system administrator scenarios.

### Database Foundation

- Add a PostgreSQL connection adapter using the existing local PostgreSQL service and the intended Azure PostgreSQL-compatible boundary.
- Add forward-only SQL migrations and a repeatable local seed operation.
- Include an organization boundary on every organization-owned record from the beginning.
- Add normalized records for organization, department, employee, hierarchy assignment, approval role, approval pool, pool membership, CEO delegate, workflow template, workflow version, workflow node, department workflow assignment, employee workflow override, and audit event.
- Store workflow versions as immutable published definitions once active requests can reference them.
- Use stable identifiers, uniqueness constraints, foreign keys, active or effective-state fields, and timestamps appropriate to each record.
- Preserve application-managed hierarchy and workflow assignments separately from directory suggestions.
- Treat the effective employee workflow as the employee override when present, otherwise the active department assignment, with the resolution shown in the People interface.
- Record the actor, authority, action, target entity, reason where required, and timestamps for administrative changes.
- Keep request, approval-step, payment, attachment, and complete request-history tables for the subsequent reimbursement vertical slice unless needed by a read-model seam.

### Seed Data

- Seed one local organization with representative departments such as Engineering, Operations, and Finance.
- Seed the existing local identities plus HR, system administrator, approver, Finance, CEO, and delegate authority as needed for the administrative scenarios.
- Seed application-managed manager assignments, approval roles, pools, workflow templates, published versions, department defaults, and at least one employee override.
- Seed representative operational metrics for the Overview and label their prototype status in the UI.
- Make seed operations idempotent so local setup can be repeated without duplicating users or workflow definitions.

### Administrative Navigation and UI

- Add a distinct administrative shell rather than extending the employee expense navigation with hidden links.
- Provide responsive navigation for Overview, People, Workflows, Roles and pools, Requests, Audit log, and Settings.
- Show the current operator, organization context, active section, and sign-out action.
- Use desktop space for dense administrative tables while providing stacked or card-based responsive alternatives rather than unreadable compressed tables.
- Keep important actions and blocking messages persistent in the page rather than relying on temporary toasts.

### Overview Read Model

- Provide a server-side Overview read model for the current month by default.
- Include workflow volume by status and stage, pending or aging work, correction volume, skipped-stage volume, and routing or assignment health where the data exists.
- Include direct links that encode filters for the relevant People, Requests, or Workflows worklist.
- Distinguish live database-backed configuration health from seeded request and payment analytics.
- Make empty, loading, stale, unavailable, and permission-denied states explicit.
- Do not claim that seeded request metrics represent complete production payment truth.

### People and Assignment Behavior

- People records will show identity attributes, active state, department, application manager, directory suggestion status, effective workflow, and assignment source.
- HR may create or update application-managed assignments through server-side commands.
- Department workflow assignment is the default policy.
- An employee workflow override takes precedence over the department default and must be visibly identified.
- Removing an employee override restores the department default without deleting the workflow version.
- Missing manager or workflow configuration must be visible as an operational exception and must never cause an arbitrary person to be selected.

### Workflow Lifecycle

- Workflow templates are separate for pre-spend permission and reimbursement.
- A workflow progresses through draft, simulation, validation, and publication states.
- Only validated published versions can receive new assignments for active use.
- Published versions used by active requests are immutable.
- The first executable path is ordered; arbitrary branches, loops, parallel paths, and general BPM behavior remain out of scope.
- Supported node types are approval, notification, Finance verification, and payment completion.
- Workflow nodes support explicit target types and relevant conditions without embedding category names into approval routing.
- HR may publish workflow versions as an accepted administrative authority decision, with all publication actions audited.

### Authorization

- Administrative authorization is enforced in server-side commands, not only in navigation or component rendering.
- The initial implementation must distinguish at least HR and system administrator access for administrative work.
- The exact full permission matrix for Finance, CEO, delegates, and other roles remains a follow-up decision, but the seams must allow role-specific authorization.
- Organization scoping must be applied to every read and mutation.

### API and Command Contracts

- Provide read operations for administrative Overview, People search, employee detail, workflow list, workflow detail, role and pool records, Requests, and Audit log.
- Provide mutation commands for employee and department assignment, role and pool maintenance, workflow draft creation and editing, workflow simulation, validation, publication, disable or restore behavior, and workflow assignment.
- Commands must return domain-level success or actionable validation and authorization errors.
- Commands must use request or entity version checks where concurrent edits could overwrite administrative changes.
- Repeated commands must not duplicate audit events or assignments.
- The Overview should consume a single composed read model or minimal number of server reads rather than re-implementing business calculations in client components.

## Testing Decisions

- Test externally observable authorization, persistence, state transitions, read-model results, audit events, and user-visible recovery behavior.
- Do not test React component structure, CSS class names, SQL implementation details, or internal helper names.
- Add database integration tests against the local PostgreSQL service for migration application, seed idempotency, organization scoping, effective workflow resolution, immutability of published versions, and assignment override behavior.
- Add application-command tests for HR authorization, system administrator authorization, invalid workflow publication, audit event creation, and duplicate command behavior.
- Add protected route tests at the highest existing server boundary, verifying that unauthenticated and unauthorized users cannot read or mutate administrative records.
- Add Overview read-model tests for current-month defaults, filtered worklist links, prototype-data labeling, empty states, and assignment health.
- Add end-to-end browser coverage for an HR operator opening Overview, navigating to People, assigning a department workflow, overriding one employee, creating and publishing a workflow, and returning to a filtered worklist.
- Add responsive and keyboard checks for the administrative shell, tables, filters, workflow editor alternatives, and status messages at the project’s required mobile and zoom targets.
- Use seeded local identities and local PostgreSQL as prior art for integration scenarios rather than introducing production provider dependencies.

## Out of Scope

- Complete reimbursement, approval, Finance payment, receipt, and adjustment domain implementation.
- Production Microsoft Entra ID or Microsoft Graph synchronization.
- Treating Microsoft Graph as authoritative for approval relationships.
- Automatic workflow routing from arbitrary category names.
- Arbitrary workflow branches, loops, parallel approvals, or a general BPM engine.
- Real-time dashboard updates.
- Advanced executive reporting, Power BI, forecasting, or financial reconciliation.
- Bulk workflow assignment with complex conflict resolution beyond department defaults and explicit employee overrides.
- A finalized permission matrix for every future administrative and executive role.
- Importing production employees, requests, attachments, or historical audit records.
- Direct editing of published workflow definitions.

## Further Notes

The existing broad specification says system administrators publish tested workflow versions.

This focused session explicitly selected HR publication authority for the first administrative experience, and that decision is recorded in the administrative dashboard ADR.

The implementation should keep publication authorization behind a role policy so this decision can be revised without redesigning the workflow model.

The dashboard is the first administrative surface, not the final analytics product.

Its value comes from connecting operational insight to the people and workflow records HR can correct.

The next domain slice should replace seeded request metrics with persisted PermissionRequest, ReimbursementClaim, WorkflowInstance, ApprovalStep, and PaymentRecord data while preserving the Overview read-model contract.
