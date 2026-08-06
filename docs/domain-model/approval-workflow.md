# Approval Workflow Domain Model

Status: working discovery draft.

This document records the current grilling session.

It separates confirmed business direction from recommendations and unresolved decisions.

## Confirmed Direction

- A pre-spend permission request and a reimbursement claim are separate forms.
- A reimbursement claim may reference the earlier permission request.
- A reimbursement without pre-approval follows the normal approval path plus an additional review.
- If the approved amount is 100 and the claim is 140, the additional 40 needs approval.
- Retired: The CEO is a required approval stage for normal requests. Superseded by issue #39 (https://github.com/muhammad-shameel-ks/expence-hive-modernization/issues/39): each role has its own published flow, and Finance Head is the apex stage of a flow.
- Retired: The CEO can open any submitted request and approve it while skipping every earlier stage. Superseded: any later-stage role can take over a request and skip earlier stages, and the Finance Head apex can bypass every pending stage up to the terminal Finance Executive stage.
- Retired: CEO authority can also be exercised by people on a CEO-maintained safe list.
- Retired: A safe-list person may act for the CEO whether or not the CEO is on leave.
- Retired: A delegate's action must record the real actor and that the actor acted for the CEO.
- Retired: A CEO or delegate override can skip all earlier hierarchy stages, including category-specific stages. Superseded: a takeover by a later-stage role (or the Finance Head apex) skips the earlier stages, and each skipped stage is recorded as skipped.
- A skipped stage must be visible in the request history as skipped rather than approved.
- Retired: A CEO delegate cannot approve their own expense. Superseded: self-approval prevention applies to every requester at every stage.
- Retired: A delegate's own expense should be routed to the CEO. Superseded: every requester's expense follows the flow published for their role, and the requester is never eligible to act on their own claim at any stage.
- There is no send-back-for-correction cycle anywhere in the approval path.
- Any approver at any stage, including Finance, rejects a request outright and immediately rather than returning it for correction.
- A rejection is terminal for the rejected request: it is never edited or resubmitted.
- An employee may submit a brand-new claim for the same expense after a rejection; the new claim is a distinct request with its own identity and history, not a resubmission of the rejected one.
- A rejection reason remains mandatory so the employee understands the outcome, even though there is no path back to fix the rejected request in place.
- If a required approver is missing, the request should go to the next configured hierarchy stage.
- The missing stage must be recorded as skipped and the missing assignment should be visible to an administrator.
- Finance verifies an approved request and sends it to payment.
- The current preference is for the Finance verifier to mark the request as paid.
- Both single-expense and multi-expense submission modes are needed.
- One approval covers the total of a multi-line claim.
- Retired: The CEO owns the safe list and changes to it are audited.
- Retired: The CEO's own expense goes to an independent Finance approver. Superseded: the requester is never eligible at any stage, so a Finance Head or Finance Executive cannot self-approve their own claim at finance stages either.
- The same Finance person may verify and mark a payment as paid.
- A reimbursement without pre-approval receives an additional Finance review.
- The first modern version uses one default workflow with optional department-specific workflows.
- Category rules control fields and limits, while workflow configuration controls approvers.
- Retired: No earlier approval stage is non-skippable when CEO authority is used. Superseded: the terminal Finance Executive stage is never auto-skipped by absence, and no takeover ever skips it.
- A higher approval stage may take over a submitted request and skip all earlier stages.
- Retired: The configured approval stages run through CEO. Superseded: each role has its own published flow, and Finance Head is the apex stage of a flow.
- Retired: Finance performs the final completion and payment marking after CEO approval. Superseded: the Finance Executive role is the required terminal verification-and-payment stage.
- Pre-spend permission and reimbursement use separate workflow templates.
- A reimbursement without linked permission receives an automatic additional Finance review.
- Superadmin maintains employee hierarchy (manager and team-lead assignments), roles, departments, and published flows; the Superadmin console is the only administrative surface.
- Superadmin publishes tested workflow versions.
- Notification nodes do not block a workflow.
- Employees and authorized approvers can see the full claim history.
- Finance has no distinct `Needs correction` state; Finance rejects a claim outright, the same as any other approval stage, when payment information or evidence is missing or invalid.
- Paid claims cannot be directly edited after payment.
- Paid claims are corrected through a new adjustment claim rather than by editing the paid claim.
- Retired: System administrators define CEO override reason codes. Superseded: takeover reasons are validated as free text today; an admin-managed reason-code catalog remains follow-up work.
- The final employee-facing status is `Approved and paid`.
- Missing hierarchy assignments notify Superadmin after the request continues.
- The approval hierarchy is configured inside ExpenseHive rather than being inferred entirely from Microsoft Graph.
- Microsoft Graph may supply people and directory attributes, but ExpenseHive is authoritative for approval relationships.
- An active request keeps the workflow version that was assigned when the request started.
- The current implementation does not route approvals by category.
- A reimbursement claim captures Payout Details (account number and IFSC code) per claim at submission, rather than storing them once on the employee profile.
- Payout Details are visible only to the claim's owner and Finance role holders (Finance Head and Finance Executive).
- Approvers acting on a claim (manager, team lead, and other non-finance roles) do not see Payout Details; approval does not require payout information.
- Status, payment status, and approval timestamps are workflow state, not payout data, and remain visible to the claim owner and approvers in the chain.
- Retired: Finance payment processing was planned as a distinct view from HR's administrative Requests browsing page, with its own access rule rather than reusing the HR admin console. Superseded by issue #39: there is no HR console, the Superadmin console manages people, roles, and flows, and the Finance payment queue has its own finance-capability access rule.
- Retired: HR was to be added as an explicit value in the expense-side role system. Superseded by issue #39: the two role systems collapsed into one Role entity, and the shared authorization seam (`src/server/shared/authorization.ts`) is the single place that resolves a role to its capabilities.
- The legacy Reimbursement Requests table's remaining columns (Sub Category, Remark, Comments, Payment Status, Approved On) are carried into the new Finance Payment View so Finance keeps the columns it already relies on.
- Sub Category and Remark are captured by the employee on the expense creation flow, alongside Category, the same way Payout Details are.
- Comments is authored by Finance after submission, not by the employee, and is edited directly from the Finance Payment View.
- Payment Status and Approved On are not new stored fields; Payment Status is derived from claim status (`paid` versus everything else in the Finance queue), and Approved On is derived from the last `approved` history event, matching the existing "workflow state stays visible, payout data stays restricted" split.

## Confirmed Direction: User, Role, and Flow Management

- Superadmin replaces the System administrator role rather than sitting above it; there is one administrative identity with full authority over employees, departments, roles, and flows, and it authenticates through the same login as every other employee.
- Retired: The CEO role, the CEO safe list, and the CEO delegate mechanism are retired entirely, along with the CEO-specific vocabulary built around them (issue #39).
- Finance Head is the top of a flow's hierarchy: it can bypass every earlier stage in its flow and hand the request directly to Finance Executive.
- Finance Executive is a required, non-skippable final stage that performs verification and payment marking: the same authority the old "CEO approves, then Finance completes payment" split gave to Finance, just relabeled and moved to the end of the chain.
- A flow (the user-facing term for an Approval Workflow) is an ordered sequence of step targets, for example Executive -> Manager -> Finance Head -> Finance Executive, or Intern -> (named team lead) -> Manager -> Finance Head -> Finance Executive.
- Roles are org-wide definitions: the department lives on the person, not the role. The same title (e.g. "Team Lead") is one shared role definition usable across departments.
- Superadmin creates flows and assigns each flow to a role, not to a department or an individual. Because roles are org-wide, each flow step decides its own scope: a Manager step is limited to same-department holders while all other role steps are org-wide.
- Every request from an employee holding a given role uses the flow published for that role, regardless of which specific person holds it. Resolution is deterministic: a role without its own published flow gets no flow at all; there is no fallback to a most-recently-created published flow.
- A flow stage counts as absent when either no eligible employee holds the target (vacancy or a deactivated holder) or the assigned actor has not acted on the request within 3 days (timeout): both trigger identical behavior.
- An absent stage auto-skips: it is recorded as `Skipped` with the reason ("no active employee holds this stage" or "no response within 3 days") and the request auto-advances to the next stage in the flow, without waiting for an administrator. The terminal stage is never auto-skipped.
- Any role at a later stage in a flow, not only the top of the hierarchy, may manually bypass one or more earlier stages for a specific request: for example a Manager can skip an earlier stage on a request they take ownership of.
- A manual bypass requires the actor to select a reason and creates an immutable audit event recording the actor, the authority exercised, and the stages skipped. This generalizes the former CEO-override design (actor, authority, reason, skipped stages) to any higher-stage role instead of only CEO and its delegates.
- The admin-console role system (`AdminRole`) and the claim/payment-authorization role system (`ExpenseRoleCode`) collapse into one Role entity. A single org-wide role determines both what an employee can administer and what they are authorized to do in claim/payment flows: there are no longer two lists to keep in sync per employee.
- The organization starts with five locked predefined roles (Intern, Executive, Manager, Finance Head, Finance Executive) plus the built-in Superadmin identity. Locked roles cannot be renamed, deactivated, or deleted through the console; Superadmin may only assign people to them and use them in flows.
- Superadmin can create custom roles (e.g. Team Lead, Sales Lead) as org-wide definitions. Custom roles are assignable to people and usable as approval step targets, but they never receive finance (Payout Details, verify, mark paid) or administrative (console) capabilities: capability mapping is fixed to the locked catalog and Superadmin only.
- A flow step targets either a role (any locked or custom role) or the requester's assigned team lead (a named person from the hierarchy assignment). A step with no eligible holder is absent and auto-skips.
- A Manager step resolves to the set of active Manager-role holders whose department matches the requester's department, and any one of them completes the stage (pool behavior). A requester with no department has no eligible manager, so a Manager step for them is vacant and auto-skips.
- Finance Head and Finance Executive steps resolve org-wide, as do all other role steps.
- An intern's flow is a flow built by Superadmin whose first review step is the intern's assigned named team lead; the team lead's own role is irrelevant to the step.
- The Finance Head apex takeover routes a request directly to the terminal Finance Executive stage, which remains the required verification-and-payment stage and is never skipped by a takeover.
- A first sign-in provisions an unknown email as a new employee with the Executive role by default; the Superadmin console is where the role changes later. Nothing in provisioning ever rewrites an existing assignment.
- A future Microsoft Entra/Graph adapter may return profile attributes (title, department, manager) as suggestions, but suggestions are never auto-applied and are never consulted after provisioning to rewrite approval authority.
- People management covers an active state per employee: Superadmin can deactivate departed staff (blocking future sign-in and routing) and reactivate returnees without data loss. An employee cannot deactivate their own account, and the last active Superadmin cannot be deactivated.
- Superadmin assigns a manager or team lead per person, and the People section offers an interactive org tree (departments at the top, their people beneath, expand/collapse, node details with edit actions, keyboard-accessible).
- Self-approval is impossible at every stage: the requester is never an eligible approver for their own claim, whether the stage targets a role or a team lead.

## Recommendations

### Workflow Configuration

Use reusable ordered workflow templates rather than hard-coding a single company-wide chain.

Start with one default template and allow an administrator to create role-specific templates.

Allow category rules to add an extra review or apply a limit without requiring a completely separate workflow for every category.

Every stage should have an explicit target kind: a role (any locked or custom role, resolved org-wide, or same-department for Manager) or the requester's assigned team lead (a named person).

Use role steps for normal stages and named-person team-lead steps for intern-style review paths.

The system should never silently choose a random person when an assignment is missing.

### Hierarchy Override

Model a higher-approver takeover as a hierarchy override, not as ordinary forwarding.

The override should create an immutable history event containing the actor, the authority being exercised, the reason, the skipped stages, and the resulting decision.

Retired: The safe-list recommendation no longer applies; the CEO safe list was removed together with the CEO authority model (issue #39).

The application should prevent self-approval for every requester at every stage.

### Microsoft Graph

Use Microsoft Graph for identity and directory enrichment, such as display name, email, title, department, and possible manager information.

Do not use a job title or an incomplete Graph manager relationship as financial approval authority.

A future Entra/Graph adapter may surface profile attributes as suggestions; suggestions are never auto-applied, and application-managed assignments stay authoritative (issue #39).

Store the ExpenseHive assignment that was used for each request.

Flag missing or conflicting Graph data for an administrator instead of changing an active approval path silently.

### Payment Control

The current policy allows the same Finance person to verify and mark a payment as paid.

The application should still record the verifier, payment actor, and timestamps separately.

The visual editor should represent approval, notification, verification, and payment-completion nodes while keeping the first executable path ordered.

Conditional behavior should initially be attached to a stage or rule rather than creating arbitrary branches and loops.

### Expense Lines

Model a reimbursement as a request that can contain one or more expense lines.

Use one approval instance for the total claim amount while retaining category and amount per line for category rules and evidence.

Keep the single-line experience simple for employees who submit one expense.

## Domain Vocabulary

### Pre-spend Permission Request

A request for permission to incur an expense before spending occurs.

### Reimbursement Claim

A request to repay money that an employee has already spent.

### Expense Line

One categorized amount within a reimbursement claim.

### Approval Workflow

The ordered stages and rules that determine who must review a request.

### Approval Stage

One required or optional checkpoint in an approval workflow.

### Approval Step

The request-specific instance of an approval stage, including its assigned actor and status.

### Approval History

The immutable record of submissions, decisions, rejections, skipped stages, overrides, and payment events.

### Rejection

An outright, terminal decision by an approver at any stage, including Finance, that ends the request with a mandatory reason. A rejection is never edited or resubmitted; the employee may submit a new, distinct claim for the same expense instead. Replaces the retired correction/send-back cycle described above.

### Activity Feed

A chronological view of an actor's own decisions and comments across claims (personal feed) or of every employee's decisions and comments (organization feed, restricted to Finance Head). Activity is derived from append-only history events and does not create a separate mutable record store.

### Application Manager

The manager relationship explicitly assigned and maintained in ExpenseHive, stored in the hierarchy assignments. For an intern, the assigned person acts as the named team lead: a team-lead flow step resolves to this specific person, whose own role is irrelevant.

### Approval Role

An org-wide ExpenseHive role definition such as Manager, Finance Head, Finance Executive, or a custom role. A role step resolves to the active holders of the role, org-wide except for Manager steps, which resolve to active holders in the requester's department.

### Approval Pool

Not a stored entity. The Manager step behaves as an implicit pool of the active Manager-role holders in the requester's department, where any one eligible holder completes the stage. Pools with explicit membership records or a quorum greater than one are out of scope (issue #39).

### Hierarchy Override

An authorized higher-stage role's action that takes ownership of a submitted request and skips one or more earlier approval stages in that request's flow. Any role positioned later in a flow can exercise this over the roles before it, not only the flow's top role. Retired: CEO Delegate and the CEO safe list: role unavailability is instead handled uniformly by the absence auto-skip described below.

### Takeover

The implementation term for a Hierarchy Override: the acting role takes ownership of the current pending stage at (or skips to) a later stage targeting its own role, recording the skipped stages in history. The Finance Head apex takeover skips every pending stage up to the terminal stage and assigns the terminal stage to the first eligible holder of its role (a Finance Executive) rather than to the Finance Head themselves.

### Reason Code

A required standard explanation for a hierarchy override or another exceptional action. Today the reason is validated as free text; an admin-managed reason-code catalog remains follow-up work.

### Superadmin

The single administrative identity with full authority over employees, departments, roles, and flows. Superadmin is a built-in identity, not a role: it is not assignable, holds no other role, and cannot be deactivated or demoted. Replaces the former System administrator role rather than sitting above it.

### Department

An organizational grouping of people. The department lives on the person (employee record), not on the role; roles are org-wide definitions.

### Role

An org-wide definition (code plus display name) that is a step target in a flow. The organization starts with five locked predefined roles - Intern, Executive, Manager, Finance Head, Finance Executive - plus the built-in Superadmin identity. Locked roles cannot be renamed, deactivated, or deleted through the console. Superadmin can create custom roles, which are org-wide definitions usable only as approval step targets and never receive finance or administrative capabilities.

### Custom Role

A role created by Superadmin (locked = false), such as Team Lead. Assignable to people and usable as a flow step target; grants no finance or administrative capabilities.

### Step Target

The two target kinds of a flow step: `role` (any locked or custom role, resolved org-wide, or same-department for Manager steps) and `team-lead` (the requester's assigned named person from the hierarchy assignment, whose own role is irrelevant).

### Flow

The user-facing term for an Approval Workflow: an ordered sequence of step targets assigned by Superadmin to a role so that every request from an employee holding that role is routed through it. Resolution is deterministic: only the flow published for the role matches, and a role without its own published flow gets no flow at all (no fallback to a most-recently-created published flow).

### Absent Stage

A flow stage where either no eligible employee holds the target (vacancy, or the holder is deactivated) or the assigned actor has not acted within 3 days (timeout). Both conditions auto-skip the stage; the terminal stage is never auto-skipped.

### Provisioning

The first-login behavior for an unknown email: it creates an employee record with the organization's default Executive role. The Superadmin console changes roles later; provisioning never rewrites an existing assignment. A future Entra/Graph adapter may supply profile suggestions, which are never auto-applied.

### People Management

The Superadmin console surface for people: search and filter by name, email, department, role, and active state; person detail with role, department, and manager or team-lead assignment; deactivate and reactivate with self-deactivation and last-active-Superadmin protection; and an interactive org tree view (department-grouped, expand/collapse, keyboard-accessible).

### Finance Verification

The post-approval check of receipts, payment details, and other payment prerequisites.

### Payment

The execution or recording of money being paid after approval and Finance verification.

### Payout Details

The account number and IFSC code an employee provides on a reimbursement claim so Finance can pay it. Visible only to the claim's owner and Finance role holders (Finance Head and Finance Executive).

### Finance Payment View

The Finance-facing screen for verifying Payout Details and marking claims paid.

## Current Implementation Findings

- `Category` currently has only code, name, and active state in `aspnet-core/src/ExpenseHive.Application.Contracts/Categories/CategoryDto .cs`.
- The Angular reimbursement form uses category names to show date fields for Internet Expense, Telephone Expenses, and Employee Training Expense.
- The backend applies a special Internet Expense amount limit and a 30-day invoice-date rule, but it does not route by category.
- Approval routing is implemented with fixed ABP role names and an `ApprovalStatus` enum.
- The legacy model stores role-specific comments and a single status on `Reimbursement` rather than separate request-specific approval steps.
- The existing Graph integration sends email and does not import employee hierarchy data.
- The Next.js rebuild previously had two disconnected role systems (`AdminRole` in `src/server/admin/ports.ts`, which included `hr-administrator`, for the admin console, and `ExpenseRoleCode` in `src/server/expenses/ports.ts` for claim and payment authorization). That split is fixed: both command layers now read one Role vocabulary resolved through the shared authorization seam `src/server/shared/authorization.ts` (`resolveRoleCapabilities`, consumed by admin and expense commands alike), with the locked predefined catalog mapped to its capabilities and every other code (including the former HR codes) resolving to the submit-only default.
- `reimbursement_claims` now stores account number and IFSC code columns, so Payout Details exist on the claim record; the Finance Payment View reads them from the persisted claim.
- Migrations 0016-0018 added the `locked` flag on roles, the `active` flag on employees, and the `kind` column on `flow_steps` (role versus team-lead targets), and `claim_approval_steps.role_id` became nullable so a resolved team-lead step can carry only its assigned actor.

## Open Questions

- Should workflow templates later be scoped by legal entity in addition to department?
- Should the additional Finance review be represented as a fixed stage or as a rule attached to the claim?
- What amount and category rules define high-risk requests?
- Should category rules add reviewers, change stage targets, impose limits, require evidence, or all of these?
- What happens when the reimbursement amount exceeds the pre-approved amount by a configured threshold?
- What reason codes are available for a manual hierarchy-override bypass, now that takeover reasons are free text and a catalog is follow-up work?
- Resolved (issue #39): roles are org-wide definitions and Superadmin is a built-in identity, so the department-scoping tension between Superadmin and roles no longer exists; the department lives on the person.
- Resolved (issue #39): self-approval prevention applies universally to every requester at every stage, not only to the former CEO or delegate case.
- Can an employee hold more than one role at a time (e.g. across departments), or exactly one role, for the purpose of flow assignment? Issue #39 keeps one role per employee; the `employee_roles` many-to-many table is not exercised beyond one row per employee, and multi-role support remains out of scope.
- Resolved (issue #39): roles are org-wide and do not require a department to exist first; department rename or removal cascades are tracked separately in issue #35.
- What happens to in-flight requests whose flow's role assignment changes (e.g. Superadmin reassigns a different flow to a role): do active requests keep the flow version they started with, matching the existing "active request keeps the workflow version" rule?
