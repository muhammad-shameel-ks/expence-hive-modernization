# Database-Backed INR Expense Approval Flow

Status: ready for agent implementation.

This specification defines the first executable reimbursement vertical slice after the administrative foundation.

It extends `docs/specs/expensehive-modernization.md` and `docs/specs/hr-administration-dashboard.md`.

It does not replace the broader domain decisions for permission requests, multi-line claims, delegates, attachments, or workflow administration.

> Note: the role and user vocabulary in this specification (HR, CEO, IT reviewer, Finance reviewer, approval pools) is superseded by the role and user management spec, issue #39 (https://github.com/muhammad-shameel-ks/expence-hive-modernization/issues/39). The locked predefined roles are Intern, Executive, Manager, Finance Head, and Finance Executive, plus custom roles; HR and CEO are retired; and flow steps target a role or the requester's assigned named team lead.

## Problem Statement

The employee expense dashboard currently renders a hard-coded in-memory list of expenses and history events.

The dashboard cannot yet prove that an employee, an approver, a Finance Head, and a Finance Executive can use separate identities to move a real claim through an auditable approval process.

The current development authentication adapter also stores employees and sessions in memory, which prevents the first vertical slice from being fully backed by the local PostgreSQL application boundary.

Financial values in the prototype are displayed as USD, even though ExpenseHive is being built for an Indian organization.

The first implementation needs a small but complete workflow that replaces client-side demo records with persisted records while preserving the product's server-side authorization and transaction requirements.

## Solution

Build a PostgreSQL-backed reimbursement flow for a single-line expense claim.

The standard local demonstration path will be:

1. An employee creates and submits an INR claim.
2. A Manager-role holder in the employee's department approves it.
3. The Finance Head approves it.
4. The Finance Executive verifies the claim and marks it paid.
5. The employee sees `Approved and paid` and the complete history.

The employee dashboard will consume server-side read models rather than importing hard-coded expense data.

The same workspace will adapt to the current signed-in user's authority.

Employees will see their own claims, including any that were rejected.

Approvers will see claims requiring their decision.

Finance users will see claims requiring verification or payment completion.

Local development will provide a development-only user picker for switching among seeded identities.

The picker will create a PostgreSQL-backed session for the selected seeded employee and will be impossible to use in production.

All financial display and validation will use INR.

Existing illustrative numeric fixture amounts will be retained as numeric INR values rather than converted using an exchange rate.

## User Stories

1. As an employee, I want to select my seeded local identity during development, so that I can test the complete expense flow without creating production credentials.

2. As an employee, I want my local session to resolve to a persisted employee record, so that the application uses the same database identity as approval authorization.

3. As an employee, I want to start a reimbursement claim, so that I can request repayment for money I have already spent.

4. As an employee, I want to enter a claim title, category, amount, and expense date, so that I can provide the essential information needed for review.

5. As an employee, I want the amount field to use Indian rupees, so that the form reflects the organization's currency.

6. As an employee, I want to save a claim as a draft, so that I can leave and resume incomplete work.

7. As an employee, I want my draft to be loaded from PostgreSQL, so that it is not lost when the browser state is reset.

8. As an employee, I want to review my claim before submission, so that I can correct mistakes before approval work starts.

9. As an employee, I want to submit a valid claim, so that it enters the configured approval path.

10. As an employee, I want invalid submission to preserve my entered values and identify the exact correction needed, so that I can recover without re-entering the claim.

11. As an employee, I want to see the current claim status, next action, blocking reason, and responsible actor, so that I understand what happens next.

12. As an employee, I want to see each approval, rejection, verification, and payment event, so that the claim history is transparent.

13. As an employee, I want a rejected claim to show a clear reason and terminal status, so that I know I must submit a new claim rather than expect the rejected one to reopen.

14. As an employee, I want a paid claim to show `Approved and paid`, so that payment completion is unambiguous.

15. As a manager, I want to see claims assigned to my manager stage, so that I can review only work requiring my action.

16. As a manager, I want to see the claim amount, requester, category, date, and history beside the decision controls, so that I can make an informed decision.

17. As a manager, I want to approve an assigned claim, so that it advances to the IT stage.

18. As a manager, I want to reject a claim with a reason, so that the employee receives a clear, actionable outcome.

19. As an IT reviewer, I want to see claims assigned to the IT stage, so that I can perform the required IT review.

20. As an IT reviewer, I want my decision to advance or stop only the claim assigned to my stage, so that I cannot act outside my authority.

21. As a Finance Head, I want to review claims at the Finance Head stage, so that the standard reimbursement path includes the apex financial review.

22. As a Finance Executive, I want to see claims after the Finance Head stage, so that I can verify the payment prerequisites.

23. As Finance, I want to mark a verified claim as paid, so that the employee receives a completed reimbursement status.

24. As Finance, I want verification and payment to be separate auditable actions, so that the payment record identifies both actions and timestamps even when the same person performs them.

25. As an authorized actor, I want the system to reject attempts to approve an unassigned stage, so that UI visibility cannot grant financial authority.

26. As an authorized actor, I want the system to reject self-approval, so that a requester cannot approve their own claim.

27. As an authorized actor, I want repeated decisions to be safely rejected or treated as already completed, so that duplicate requests do not create duplicate history events.

28. As an authorized actor, I want concurrent decisions on one exclusive stage to allow only one successful transition, so that the approval history remains consistent.

29. As a local developer, I want seeded Manager, Finance Head, Finance Executive, and employee identities, so that every stage of the standard path can be exercised.

30. As a local developer, I want seeded claim fixtures to be stored in PostgreSQL, so that the dashboard has useful data without importing a mock-data module.

31. As a user, I want all financial values and financial copy to use INR, so that USD and dollar-denominated labels do not appear in the application.

32. As a user, I want the employee dashboard to show an empty state when no persisted claims exist, so that an empty database is understandable rather than appearing broken.

33. As an employee, I want a "My activity" feed of every decision and comment I have made on any claim, so that my actions stay visible after the claim moves past my stage and drops out of my workspace list.

34. As a Finance user, I want to view any employee's individual activity feed, so that I can audit a single person's decisions and comments.

35. As a Finance Head, I want an organization-wide activity feed of every employee's decisions and comments, so that the apex financial role can audit the whole organization from one place.

36. As a user who has ever acted on a claim, I want to reopen its detail view even after it has moved past my stage, so that a decision I made remains traceable.

37. As a Finance Head, I want the same standing oversight as Finance: payout details, comments, the finance payment queue, and any employee's activity feed, so that the apex financial role can audit and process everything without extra assignments.

## Implementation Decisions

### Application Boundary

- The browser will read composed dashboard and request-detail read models from protected server-side entrypoints.
- All claim creation, draft updates, submission, approval, rejection, verification, and payment actions will pass through server-side application commands.
- Each command will authenticate the current session, enforce organization scope, authorize the current actor, validate the state transition, and execute its mutation inside a database transaction.
- The browser will not directly write claim, approval, history, or payment records.
- The primary test seam will be the protected server-side command boundary called through route handlers or equivalent application entrypoints.

### Identity and Local Sessions

- Employees, role assignments, hierarchy assignments, and local sessions will be persisted in PostgreSQL for this slice.
- The development-only user picker will list the seeded local identities and create a session for a selected employee.
- The development identity path will be guarded so it cannot run in production.
- Production Entra ID integration remains a provider concern and is not introduced by this slice.
- The current user identity used by every command will come from the persisted session rather than a client-provided employee identifier.

### Seeded Organization and Authority

- Seed one organization boundary for local development.
- Seed Muhammad Shameel as the employee used for the standard demonstration claim.
- Assign Ada Lovelace as Muhammad Shameel's application-managed manager.
- Retired by issue #39: add a real CEO role and assign it to the seeded CEO identity.
- Retired by issue #39: retain CEO delegate as a separate role for the later safe-list and delegated-authority slice.
- Seed the Intern, Executive, Manager, Finance Head, Finance Executive, Superadmin, and at least one custom role (e.g. Team Lead) vocabulary required by the current application. Superseded by issue #39 for the role catalog: HR, CEO, IT reviewer, and Finance reviewer role codes are removed.
- Seed the Finance Head role as the apex financial role: it bypasses every earlier stage in its flow and shares Finance standing oversight over payout details, comments, the payment queue, and individual activity feeds.
- Keep directory suggestions separate from application-managed manager and approval assignments.

### Reimbursement Model

- Model a reimbursement as a claim owned by one employee and one organization.
- Model the claim's expense details as an expense line even though the first UI permits exactly one line.
- Store title, category, amount, currency, expense date, draft or submission timestamps, current status, and an optimistic version on the claim or its line records.
- Store monetary amounts as integer minor units to avoid floating-point calculation errors.
- Store `INR` as the only supported currency in this slice.
- Validate that claim amounts are positive and that dates and required fields are valid before submission.
- Do not link claims to permission requests in this slice.
- Do not allow direct edits after payment.

### Workflow and Approval Steps

- Assign the standard reimbursement workflow to the seeded organization.
- The ordered executable path will contain Manager approval, Finance Head approval, Finance Executive verification, and payment completion. Superseded by issue #39 for the stage vocabulary: the IT review and CEO stages are retired.
- Resolve the Manager stage through the active Manager-role holders in the requester's department (any one of them approves).
- Resolve the Finance Head and Finance Executive stages org-wide through their role holders.
- Capture the workflow version or equivalent immutable workflow reference on each submitted claim.
- Create request-specific approval steps when a claim is submitted rather than resolving authority only at display time.
- An approval step can be pending, approved, rejected, skipped, or completed according to its node type.
- A normal approver can act only on the currently assigned pending stage.
- One eligible person completes an ordinary role stage. Superseded by issue #39: pools are not separate entities; the Manager step is an implicit same-department pool with quorum one.
- Missing assignment behavior will follow the broader specification by recording a skipped stage and notifying Superadmin, but the seeded happy path must have all assignments present.
- Retired by issue #39: CEO takeover and delegate authority. Higher-stage override and amount overrun approval remain later slices; arbitrary workflow branching remains out of scope.

### Claim Lifecycle

- A claim may be saved as `draft` without creating approval steps.
- Submission changes the claim to an active approval state and creates its ordered approval steps in one transaction.
- Successful Manager and Finance Head decisions advance the claim to the next stage.
- A rejection at any stage, including Finance, changes the claim to `rejected` immediately and records the reason.
- A rejected claim is terminal: it is never edited or resubmitted, and there is no correction or send-back cycle.
- An employee may submit a new, distinct claim for the same expense after a rejection; the new claim restarts at the first approval stage and preserves the rejected claim's history unchanged.
- Finance Head approval advances the claim to Finance Executive verification.
- Finance verification records a distinct verification action and advances the claim to payment completion.
- Finance payment marking records a distinct payment action and changes the final employee-facing status to `Approved and paid`.
- Paid claims are immutable through ordinary employee editing.

### History and Payment Records

- Store append-only history events for draft creation, submission, approval, rejection, verification, and payment.
- Every history event records the organization, claim, actor, authority or role exercised, action, reason where required, workflow reference, and timestamp.
- Store Finance verification and payment information in a payment record or equivalent normalized records.
- Record verifier, payment actor, verification timestamp, payment timestamp, and payment status separately.
- History visibility will be restricted to the requester, Finance role holders (including Finance Head), the currently assigned actor, and anyone who has ever acted on the claim such as an earlier-stage approver or a commenter.

### Role-Aware Workspace

- Preserve one unified workspace shell while composing role-aware read models for the current user.
- Employee views will default to claims submitted by the current employee.
- Approver views will default to claims requiring action from the current user.
- Finance views will default to claims awaiting verification or payment completion.
- The dashboard will separate actionable, waiting, completed, draft, and rejected records using explicit labels rather than color alone.
- The request detail view will put claim evidence, current stage, next action, blocking reason, decision controls, and history in one view.
- Empty, loading, error, unauthorized, and stale states will be explicit.

### Activity Feeds

- The personal "My activity" feed will list every decision and comment the current user made on any claim in the organization, including claims no longer assigned to them.
- The personal feed derives from append-only history events, so an action stays visible even after the claim moves past the actor's stage.
- Finance role holders (Finance Head and Finance Executive) may view any employee's individual activity feed; other employees can only view their own.
- The organization-wide activity feed will list every employee's decisions and comments and is restricted to Finance Head alone.
- Comment events authored by Finance will appear in the commenter's personal feed and in the organization feed, matching how approval and rejection events appear.

### INR Localization

- Replace financial USD display and dollar-denominated copy with INR formatting across the application, including dashboard cards, tables, drawers, forms, statuses, validation messages, fixtures, and tests.
- Use Indian locale and INR currency formatting for rendered amounts.
- Preserve existing illustrative numeric fixture values as INR values rather than applying currency conversion.
- Financial copy must not contain `$` amounts.
- SQL parameter placeholders such as `$1` and JavaScript template interpolation syntax such as `${value}` are implementation syntax and must not be changed as part of currency localization.

### Hard-Coded Data Removal

- Remove the dashboard's direct dependency on the hard-coded expense collection and history records.
- Move local demonstration employees, roles, workflow assignments, claims, approval steps, and history into idempotent PostgreSQL seed operations.
- Keep test builders and deterministic test fixtures in test code where necessary, but do not expose them as application read data.
- The dashboard must render persisted query results and a meaningful empty state when the database has no claims.

### API and Command Contracts

- Provide a protected current-user read operation for dashboard summary and claim list data.
- Provide a protected claim-detail read operation with approval chain, history, and payment data.
- Provide commands equivalent to create draft, update draft, submit claim, approve stage, reject claim, verify payment, and mark paid.
- Return domain-level validation, authorization, conflict, and not-found errors that the UI can present as actionable messages.
- Use entity or request versions for state-changing commands where concurrent updates are possible.
- Ensure repeated commands do not duplicate state transitions or history events.

## Testing Decisions

- Tests will assert externally observable persistence, authorization, state transitions, read-model results, history events, payment records, and user-visible recovery behavior.
- Tests will not assert React component structure, CSS class names, SQL implementation details, or internal helper names.
- Add migration and seed integration coverage for organization scoping, idempotency, seeded authority mapping, and persisted local sessions.
- Add application-command coverage for draft creation, submission, each approval stage, rejection, Finance verification, payment, self-approval prevention, unauthorized stage actions, optimistic conflicts, and duplicate commands.
- Add protected route coverage for unauthenticated access, unauthorized access, current-user filtering, role-aware inbox results, and claim detail visibility.
- Add read-model coverage for dashboard statistics, INR formatting inputs, empty states, current stage, next action, blocking reason, and final paid status.
- Add read-model and command coverage for the personal and organization-wide activity feeds, including role restrictions, actor attribution, and the claim-detail visibility rule for anyone who has ever acted on the claim.
- Add end-to-end browser coverage for switching from the employee identity to Manager, Finance Head, and Finance Executive identities and completing the claim-to-paid path.
- Add end-to-end coverage that a rejected claim is terminal and that the employee can submit a new claim for the same expense afterward.
- Add end-to-end coverage that a paid claim cannot be edited through the normal employee interface.
- Add responsive and keyboard checks for claim creation, review, approval actions, payment actions, and the role-aware workspace.
- Reuse the existing server boundary and seeded local identity testing patterns established by the authentication and administration tests.

## Out of Scope

- Production Microsoft Entra ID integration.
- Microsoft Graph synchronization.
- Permission requests and linked pre-approvals.
- Multi-line claims in the employee UI.
- Retired by issue #39: CEO safe lists and CEO delegates. Higher-stage takeover and override reason codes were later implemented as takeover behavior.
- Amount-overrun approval behavior.
- Arbitrary workflow branches, loops, parallel approvals, or general BPM behavior.
- Production payment execution or bank and accounting integrations.
- Receipt OCR, receipt matching, email receipt forwarding, and private Azure Blob Storage integration.
- Post-payment adjustment claims.
- Realtime updates.
- Advanced reporting, budgets, forecasting, and reconciliation.
- Importing production employees, claims, attachments, or audit history.
- Removing `$` characters that are SQL placeholders or programming-language syntax rather than financial currency.

## Further Notes

This slice is intentionally narrower than the full modernization specification but must be executable from creation through payment using real persisted state.

The standard seeded flow is a demonstration path and does not imply that every future department must use Manager, Finance Head, and Finance Executive in exactly that order.

Workflow configuration should remain behind an application boundary so the initial ordered path can later be replaced by published workflow versions without moving authority into client components.

The next domain slice should add permission requests, multi-line claims, attachment storage, and expanded workflow configuration on top of the persisted claim and history model established here.

CEO delegates were retired by issue #39, and takeover behavior is implemented rather than remaining a later slice.
