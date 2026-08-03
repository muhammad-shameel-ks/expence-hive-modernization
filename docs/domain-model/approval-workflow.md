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

An authorized higher-stage action that takes ownership of a submitted request and skips earlier approval stages.

### CEO Delegate

A person on the CEO's safe list who may act for the CEO.

### Reason Code

A required standard explanation for a hierarchy override or another exceptional action.

### Finance Verification

The post-approval check of receipts, payment details, and other payment prerequisites.

### Payment

The execution or recording of money being paid after approval and Finance verification.

## Current Implementation Findings

- `Category` currently has only code, name, and active state in `aspnet-core/src/ExpenseHive.Application.Contracts/Categories/CategoryDto .cs`.
- The Angular reimbursement form uses category names to show date fields for Internet Expense, Telephone Expenses, and Employee Training Expense.
- The backend applies a special Internet Expense amount limit and a 30-day invoice-date rule, but it does not route by category.
- Approval routing is implemented with fixed ABP role names and an `ApprovalStatus` enum.
- The legacy model stores role-specific comments and a single status on `Reimbursement` rather than separate request-specific approval steps.
- The existing Graph integration sends email and does not import employee hierarchy data.

## Open Questions

- Should workflow templates later be scoped by legal entity in addition to department?
- Should the additional Finance review be represented as a fixed stage or as a rule attached to the claim?
- What amount and category rules define high-risk requests?
- Should category rules add reviewers, change stage targets, impose limits, require evidence, or all of these?
- What happens when the reimbursement amount exceeds the pre-approved amount by a configured threshold?
- How should CEO safe-list entries be displayed and revoked by the CEO?
- What reason codes are available for a CEO hierarchy override?
- Should higher-stage takeover reason codes be shared with CEO override reason codes?
