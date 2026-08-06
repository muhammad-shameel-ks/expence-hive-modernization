# Approval Workflow Domain Model

Status: working discovery draft.

This document records the current grilling session.

It separates confirmed business direction from recommendations and unresolved decisions.

## Confirmed Direction

- A pre-spend permission request and a reimbursement claim are separate forms.
- A reimbursement claim may reference the earlier permission request.
- A reimbursement without pre-approval follows the normal approval path plus an additional review.
- If the approved amount is 100 and the claim is 140, the additional 40 needs approval.
- The CEO is a required approval stage for normal requests.
- The CEO can open any submitted request and approve it while skipping every earlier stage.
- CEO authority can also be exercised by people on a CEO-maintained safe list.
- A safe-list person may act for the CEO whether or not the CEO is on leave.
- A delegate's action must record the real actor and that the actor acted for the CEO.
- A CEO or delegate override can skip all earlier hierarchy stages, including category-specific stages.
- A skipped stage must be visible in the request history as skipped rather than approved.
- A CEO delegate cannot approve their own expense.
- A delegate's own expense should be routed to the CEO.
- A rejected request can be corrected and resubmitted.
- A corrected request restarts at the first approval stage.
- If a required approver is missing, the request should go to the next configured hierarchy stage.
- The missing stage must be recorded as skipped and the missing assignment should be visible to an administrator.
- Finance verifies an approved request and sends it to payment.
- The current preference is for the Finance verifier to mark the request as paid.
- Both single-expense and multi-expense submission modes are needed.
- One approval covers the total of a multi-line claim.
- The CEO owns the safe list and changes to it are audited.
- The CEO's own expense goes to an independent Finance approver.
- The same Finance person may verify and mark a payment as paid.
- A reimbursement without pre-approval receives an additional Finance review.
- The first modern version uses one default workflow with optional department-specific workflows.
- Category rules control fields and limits, while workflow configuration controls approvers.
- No earlier approval stage is non-skippable when CEO authority is used.
- A higher approval stage may take over a submitted request and skip all earlier stages.
- The configured approval stages run through CEO.
- Finance performs the final completion and payment marking after CEO approval.
- Pre-spend permission and reimbursement use separate workflow templates.
- A reimbursement without linked permission receives an automatic additional Finance review.
- System administrators and HR maintain employee hierarchy, approval roles, and approval pools.
- System administrators publish tested workflow versions.
- Notification nodes do not block a workflow.
- Employees and authorized approvers can see the full claim history.
- Finance corrections use a distinct `Needs correction` state.
- Paid claims cannot be directly edited after payment.
- Paid claims are corrected through a new adjustment claim rather than by editing the paid claim.
- System administrators define CEO override reason codes.
- The final employee-facing status is `Approved and paid`.
- Missing hierarchy assignments notify HR and system administrators after the request continues.
- The approval hierarchy is configured inside ExpenseHive rather than being inferred entirely from Microsoft Graph.
- Microsoft Graph may supply people and directory attributes, but ExpenseHive is authoritative for approval relationships.
- An active request keeps the workflow version that was assigned when the request started.
- The current implementation does not route approvals by category.
- A reimbursement claim captures Payout Details (account number and IFSC code) per claim at submission, rather than storing them once on the employee profile.
- Payout Details are visible only to the claim's owner, Finance, and HR.
- Approvers acting on a claim (manager, IT, CEO) do not see Payout Details; approval does not require payout information.
- Status, payment status, and approval timestamps are workflow state, not payout data, and remain visible to the claim owner and approvers in the chain.
- Finance payment processing (verifying Payout Details and marking a claim paid) is a distinct view from HR's administrative Requests browsing page, with its own access rule rather than reusing the HR admin console.
- HR is added as an explicit value in the expense-side role system so claim and payment authorization has one place to check, instead of only existing in the separate administrative role system.
- The legacy Reimbursement Requests table's remaining columns (Sub Category, Remark, Comments, Payment Status, Approved On) are carried into the new Finance Payment View so Finance and HR keep the columns they already rely on.
- Sub Category and Remark are captured by the employee on the expense creation flow, alongside Category, the same way Payout Details are.
- Comments is authored by Finance or HR after submission, not by the employee, and is edited directly from the Finance Payment View.
- Payment Status and Approved On are not new stored fields; Payment Status is derived from claim status (`paid` versus everything else in the Finance queue), and Approved On is derived from the last `approved` history event, matching the existing "workflow state stays visible, payout data stays restricted" split.

## Confirmed Direction: User, Role, and Flow Management

- Superadmin replaces the System administrator role rather than sitting above it; there is one administrative role with full authority over employees, departments, roles, and flows, and it authenticates through the same login as every other employee.
- The CEO role, the CEO safe list, and the CEO delegate mechanism are retired entirely, along with the CEO-specific vocabulary built around them.
- Finance Head is the top of a flow's hierarchy: it can bypass every earlier stage in its flow and hand the request directly to Finance Executive.
- Finance Executive is a required, non-skippable final stage that performs verification and payment marking: the same role the old "CEO approves, then Finance completes payment" split gave to Finance, just relabeled and moved to the end of the chain.
- A flow (the user-facing term for an Approval Workflow) is an ordered sequence of roles, for example Executive -> Manager -> Finance Head -> Finance Executive, or Intern -> Team Lead -> Manager -> Finance Head -> Finance Executive.
- Roles are scoped per department: the same title (e.g. "Team Lead") is a distinct role definition in each department, not one shared org-wide role.
- Superadmin creates flows and assigns each flow to a role, not to a department or an individual. Because a role is already department-scoped, assigning a flow to a role fixes both the department and the entry point in one step: there is no separate department-level flow scope.
- Every request from an employee holding a given role uses the flow assigned to that role, regardless of which specific person holds it.
- A flow stage counts as absent when either no employee currently holds that role (vacancy) or the employee who holds it has not acted on the request within 3 days (timeout): both trigger identical behavior.
- An absent stage auto-skips after 3 days: it is recorded as `Skipped` (reason: absent) and the request auto-advances to the next stage in the flow, without waiting for an administrator.
- Any role at a later stage in a flow, not only the top of the hierarchy, may manually bypass one or more earlier stages for a specific request: for example a Manager can skip an IT lead's approval on a request they take ownership of.
- A manual bypass requires the actor to select a reason code and creates an immutable audit event recording the actor, the authority exercised, and the stages skipped. This generalizes the former CEO-override design (actor, authority, reason code, skipped stages) to any higher-stage role instead of only CEO and its delegates.
- The admin-console role system (`AdminRole`) and the claim/payment-authorization role system (`ExpenseRoleCode`) collapse into one Role entity. A single department-scoped role determines both what an employee can administer and what they are authorized to do in claim/payment flows: there are no longer two lists to keep in sync per employee.

## Recommendations

### Workflow Configuration

Use reusable ordered workflow templates rather than hard-coding a single company-wide chain.

Start with one default template and allow an administrator to create department-specific templates.

Allow category rules to add an extra review or apply a limit without requiring a completely separate workflow for every category.

Every stage should have an explicit target type, such as the employee's assigned manager, a named person, an approval role, or an approval pool.

Use the application-assigned manager, an application approval role or pool, and a named user as the initial target types.

Prefer roles and pools for normal stages and named users only for exceptional fixed assignments.

The system should never silently choose a random person when an assignment is missing.

### Hierarchy Override

Model a higher-approver takeover as a hierarchy override, not as ordinary forwarding.

The override should create an immutable history event containing the actor, the authority being exercised, the reason code, the skipped stages, and the resulting decision.

The safe list should contain only explicitly authorized people and should support adding, revoking, and auditing membership.

The application should prevent self-approval for the CEO, delegates, and any other requester.

### Microsoft Graph

Use Microsoft Graph for identity and directory enrichment, such as display name, email, title, department, and possible manager information.

Do not use a job title or an incomplete Graph manager relationship as financial approval authority.

Store the ExpenseHive assignment that was used for each request.

Flag missing or conflicting Graph data for an administrator instead of changing an active approval path silently.

### Payment Control

The current policy allows the same Finance person to verify and mark a payment as paid.

The application should still record the verifier, payment actor, timestamps, and any correction cycle separately.

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

The immutable record of submissions, decisions, corrections, skipped stages, overrides, and payment events.

### Application Manager

The manager relationship explicitly assigned and maintained in ExpenseHive.

### Approval Role

An ExpenseHive-defined authority such as IT Head, Finance, or CEO.

### Approval Pool

The active set of people who may act for an approval role, where one eligible person completes the stage.

An ordinary approval pool completes when one eligible person acts unless the workflow explicitly defines a different quorum.

The higher-stage hierarchy override is separate from ordinary pool behavior and records lower stages as skipped.

### Hierarchy Override

An authorized higher-stage role's action that takes ownership of a submitted request and skips one or more earlier approval stages in that request's flow. Any role positioned later in a flow can exercise this over the roles before it, not only the flow's top role. Retired: CEO Delegate and the CEO safe list: role unavailability is instead handled uniformly by the absence auto-skip described below.

### Reason Code

A required standard explanation for a hierarchy override or another exceptional action.

### Superadmin

The single administrative role with full authority over employees, departments, roles, and flows. Replaces the former System administrator role rather than sitting above it.

### Department

An organizational grouping that scopes role definitions. The same role title in two departments (e.g. "Team Lead" in Engineering versus Sales) is a distinct role.

### Role

A department-scoped title that is a step target in a flow, e.g. Intern, Team Lead, Manager, Finance Head, Finance Executive, HR. Roles are created and assigned to flows by Superadmin, not hard-coded.

### Flow

The user-facing term for an Approval Workflow: an ordered sequence of roles assigned by Superadmin to a role so that every request from an employee holding that role is routed through it.

### Absent Stage

A flow stage where either no employee currently holds the target role (vacancy) or the employee holding it has not acted within 3 days (timeout). Both conditions auto-skip the stage.

### Finance Verification

The post-approval check of receipts, payment details, and other payment prerequisites.

### Payment

The execution or recording of money being paid after approval and Finance verification.

### Payout Details

The account number and IFSC code an employee provides on a reimbursement claim so Finance can pay it. Visible only to the claim's owner, Finance, and HR.

### Finance Payment View

The Finance-facing screen for verifying Payout Details and marking claims paid, distinct from HR's administrative Requests browsing page.

## Current Implementation Findings

- `Category` currently has only code, name, and active state in `aspnet-core/src/ExpenseHive.Application.Contracts/Categories/CategoryDto .cs`.
- The Angular reimbursement form uses category names to show date fields for Internet Expense, Telephone Expenses, and Employee Training Expense.
- The backend applies a special Internet Expense amount limit and a 30-day invoice-date rule, but it does not route by category.
- Approval routing is implemented with fixed ABP role names and an `ApprovalStatus` enum.
- The legacy model stores role-specific comments and a single status on `Reimbursement` rather than separate request-specific approval steps.
- The existing Graph integration sends email and does not import employee hierarchy data.
- The Next.js rebuild has two disconnected role systems today: `AdminRole` (`src/server/admin/ports.ts`, includes `hr-administrator`) for the admin console, and `ExpenseRoleCode` (`src/server/expenses/ports.ts`, `employee | manager | it-reviewer | ceo | finance-reviewer`) for claim/payment authorization. HR has no access to expense or payment code today because it only exists in the former.
- `reimbursement_claims` and `claim_payments` (`db/migrations/0005_reimbursement_claims.sql`) have no account number or IFSC code columns; Payout Details do not exist anywhere in the new schema yet and must be added.

## Open Questions

- Should workflow templates later be scoped by legal entity in addition to department?
- Should the additional Finance review be represented as a fixed stage or as a rule attached to the claim?
- What amount and category rules define high-risk requests?
- Should category rules add reviewers, change stage targets, impose limits, require evidence, or all of these?
- What happens when the reimbursement amount exceeds the pre-approved amount by a configured threshold?
- What reason codes are available for a manual hierarchy-override bypass, now that it is not specific to CEO?
- Superadmin is inherently organization-wide (it must create departments themselves), which sits at odds with "every role is department-scoped." Is Superadmin a special role exempt from department scoping, or does it live in an implicit organization-level department?
- Does self-approval prevention still apply universally to every role (not just the former CEO/delegate case) now that CEO-specific rules are retired?
- Can an employee hold more than one role at a time (e.g. across departments), or exactly one role, for the purpose of flow assignment?
- Does a Department need to exist (created by Superadmin) before a Role can be created inside it, and can a Department be removed or renamed once roles and flows reference it?
- What happens to in-flight requests whose flow's role assignment changes (e.g. Superadmin reassigns a different flow to a role): do active requests keep the flow version they started with, matching the existing "active request keeps the workflow version" rule?
