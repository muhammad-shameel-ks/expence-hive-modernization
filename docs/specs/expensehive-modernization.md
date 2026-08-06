# ExpenseHive Modernization Formal Specification

Status: proposed implementation baseline for the prototype.

This specification synthesizes the approved decisions from the domain-model grilling session.

The legacy `expensehive` directory is a read-only reference system and is not part of this implementation.

## Problem Statement

ExpenseHive currently uses an Angular 15 frontend and an ABP-based .NET backend with hard-coded approval statuses and role-specific fields.

The current reimbursement model stores one status and several role-specific comment columns instead of a request-specific workflow history.

The current approval path is coupled to fixed role names such as Reporting Head, Team Lead, Finance Head, CEO, and Accounts Officer.

The current application does not provide an administrator-managed hierarchy or a robust way to handle missing managers, higher-level takeovers, or CEO delegates.

Microsoft Graph is available for email but is not currently a reliable source for the company’s approval hierarchy.

Employees and approvers need a transparent, auditable process for permission requests, reimbursements, approvals, skipped stages, payment, and rejections.

The replacement must be possible to develop locally before production Azure permissions are available.

## Solution

Build a greenfield Next.js full-stack application in the new `expensehive-next` project.

The application will use protected server-side application commands for all business mutations.

The application will use a new normalized PostgreSQL schema with an organization boundary from the beginning.

The production target is Azure App Service, Azure Database for PostgreSQL, Azure Blob Storage, Microsoft Entra ID, and Microsoft Graph email.

The local target is Docker PostgreSQL, Azurite, Mailpit, and seeded development identities.

The application will provide separate pre-spend permission and reimbursement workflows.

Each workflow will be configurable through an ordered visual editor with approval, notification, Finance verification, and payment-completion nodes.

Workflow drafts can be simulated and must be published as immutable versions before receiving new requests.

ExpenseHive will own hierarchy assignments, approval roles, and approval pools.

Microsoft Graph will provide initial profile and hierarchy suggestions for administrators, but Graph data will not directly authorize financial decisions.

A higher-stage approver can take over a submitted request and skip all earlier stages.

The CEO and people on the CEO safe list can exercise CEO authority, and the system will record the real actor and authority being exercised.

The normal path reaches CEO approval and then Finance completes verification and payment marking.

The final employee-facing status is `Approved and paid`.

## User Stories

1. As an employee, I want to sign in with my company identity, so that I can use ExpenseHive without a separate password.

2. As an employee, I want my first sign-in to create a basic ExpenseHive employee record, so that I can begin using the application while HR or an administrator completes my hierarchy.

3. As an administrator, I want to see the initial profile and hierarchy suggestions returned by Microsoft Graph, so that I can use existing company data as a starting point.

4. As an administrator or HR user, I want to correct a manager or approver assignment inside ExpenseHive, so that an incomplete or inaccurate Microsoft directory does not block company policy.

5. As an administrator or HR user, I want to refresh the initial Graph suggestions for an employee, so that I can update profile information without surrendering authority to Graph.

6. As an employee, I want to request permission to spend money before making a purchase, so that I can obtain authorization before incurring an expense.

7. As an employee, I want to save a permission request as a draft, so that I can complete it later.

8. As an employee, I want to submit a completed permission request, so that the configured permission workflow can begin.

9. As an employee, I want to see the current stage and responsible approver for my permission request, so that I know who must act next.

10. As an employee, I want to withdraw or correct a draft permission request, so that I can fix mistakes before submission.

11. As an employee, I want to submit a reimbursement claim for money I have already spent, so that the organization can repay me.

12. As an employee, I want a reimbursement claim to support one or more expense lines, so that I can submit a simple claim or a grouped expense report.

13. As an employee, I want each expense line to include a category and amount, so that policy rules and evidence can be evaluated accurately.

14. As an employee, I want to upload receipts and supporting attachments, so that approvers and Finance can verify the claim.

15. As an employee, I want to store the approved permission request on a reimbursement claim, so that the reimbursement can be checked against the original authorization.

16. As an employee, I want to submit a reimbursement without pre-approval when necessary, so that legitimate unplanned expenses can still be considered.

17. As an employee, I want a reimbursement without pre-approval to receive an additional Finance review, so that the exception is evaluated without bypassing the normal approval path.

18. As an employee, I want an amount above the permission request to require approval for the additional amount, so that the original approval remains meaningful while legitimate overruns can be considered.

19. As an employee, I want a rejected claim to show a clear, final `Rejected` status with the approver's reason, so that I understand the outcome without expecting it to reopen.

20. As an employee, I want to submit a new claim for the same expense after a rejection, so that a legitimate expense is not permanently blocked by one rejected attempt.

21. As an employee, I want a new claim submitted after a rejection to start at the first approval stage like any other claim, so that every approver reviews it from the beginning.

22. As an employee, I want to see all decisions, skipped stages, reasons, actors, and Finance actions for my claim, so that the process is transparent.

23. As an approver, I want to see the complete request, expense lines, attachments, permission link, and history, so that I can make an informed decision.

24. As an approver, I want to approve my assigned stage, so that the request advances according to the published workflow.

25. As an approver, I want to reject a request outright with a reason at my stage, so that the employee understands why the request will not proceed.

26. As an approver, I want rejection to be the only negative outcome I can record, so that there is no ambiguity between a recoverable state and a final decision.

27. As an approver pool member, I want one valid decision from an eligible pool member to complete the pool stage, so that multiple people do not need to approve the same ordinary stage.

28. As a higher-stage approver, I want to take over a submitted request at any earlier stage, so that urgent or exceptional requests do not become blocked by lower stages.

29. As a higher-stage approver, I want the system to mark every skipped earlier stage as `Skipped`, so that a skipped review is not misrepresented as an approval.

30. As a higher-stage approver, I want to select a required override reason code, so that exceptional authority is governed consistently.

31. As a higher-stage approver, I want the takeover history to identify me as the real actor and record the authority I exercised, so that the audit trail is accountable.

32. As the CEO, I want to open any submitted request and approve it while skipping all earlier stages, so that I can resolve urgent requests directly.

33. As the CEO, I want the system to show the manager, IT, Finance, or other earlier stages that were skipped, so that my shortcut is visible to the employee and authorized approvers.

34. As the CEO, I want to maintain a safe list of people who may act for me, so that executive authority can continue when I am unavailable.

35. As the CEO, I want to add and remove safe-list members, so that I control who may exercise authority for my position.

36. As a CEO delegate, I want to approve and take over requests on behalf of the CEO, so that the organization can continue processing requests without waiting for the CEO.

37. As a CEO delegate, I want every action to identify both me and the CEO position I acted for, so that delegated authority is not confused with personal authority.

38. As a requester, I want the system to prevent me from approving my own expense, so that self-approval is impossible.

39. As a CEO delegate, I want my own expense to route to an independent Finance approver or the CEO, so that I cannot self-approve.

40. As an administrator, I want to configure a default ordered workflow, so that the organization has a usable approval path without hard-coded roles.

41. As an administrator, I want to create department-specific workflow variants, so that departments can reflect legitimate organizational differences.

42. As an administrator, I want to configure an application manager, approval role, approval pool, or named user as a stage target, so that the workflow can match the organization’s actual authority structure.

43. As an administrator, I want to place approval, notification, Finance verification, and payment-completion nodes on a visual canvas, so that the workflow is understandable and maintainable.

44. As an administrator, I want notification nodes not to block the workflow, so that visibility does not become an accidental approval requirement.

45. As an administrator, I want to save a workflow as a draft, so that I can prepare changes without affecting active requests.

46. As an administrator, I want to simulate a draft workflow with a sample organization, employee, form type, category, and amount, so that I can validate routing before publication.

47. As an administrator, I want to publish a tested workflow version, so that new requests use an intentional policy.

48. As an administrator, I want active requests to retain the workflow version they started with, so that later policy changes do not rewrite history.

49. As an administrator or HR user, I want a missing manager or approver assignment to skip to the next configured stage, so that a request does not stall indefinitely.

50. As an administrator or HR user, I want to be notified when a missing assignment causes a stage to be skipped, so that the hierarchy defect can be corrected.

51. As an administrator, I want category rules to control fields, limits, evidence, or additional reviews without hard-coding approval routing into category names, so that policy remains maintainable.

52. As a Finance user, I want to see claims after the CEO approval stage, so that I can verify payment prerequisites.

53. As a Finance user, I want to verify receipts, payment details, and required evidence, so that only valid claims are completed.

54. As a Finance user, I want to reject a claim outright with a reason when required payment information or evidence is missing, so that the outcome is unambiguous and the employee can submit a new claim if appropriate.

55. As a Finance user, I want to mark a verified claim as paid, so that the employee sees `Approved and paid`.

56. As a Finance user, I want payment actor, verifier, and timestamps recorded separately, so that payment history remains auditable.

57. As an employee, I want a paid claim to be protected from ordinary edits, so that the payment record remains trustworthy.

58. As a CEO, I want a post-payment correction to be represented as a new adjustment claim, so that the original paid claim remains immutable.

59. As an administrator, I want to view organization, employee, role, pool, workflow, claim, payment, and audit records, so that I can operate the system.

60. As an authorized approver, I want to see the complete history for requests I am authorized to view, so that decisions are made with context.

61. As an employee, I want to receive email notifications when the request changes stage, is rejected, is approved, or is paid, so that I do not need to monitor the application constantly.

62. As an employee, I want local development behavior to be independent of production Azure availability, so that the product can be built before tenant permissions are granted.

63. As a developer, I want seeded local users for employee, approver, Finance, CEO, and delegate roles, so that every authority path can be tested safely.

64. As a developer, I want local PostgreSQL, Blob, and email adapters to match production interfaces, so that moving to Azure does not require rewriting domain behavior.

65. As an employee, I want the default expense form to ask only for essential information first, so that submitting a claim feels quick and understandable.

66. As an employee, I want policy-specific fields to appear only when they apply to my expense, so that irrelevant accounting detail does not slow me down.

67. As an employee, I want my draft to autosave and resume after leaving the page, so that I do not lose work.

68. As an employee, I want the application to show a review summary before final submission, so that I can catch mistakes before creating an approval request.

69. As an employee, I want validation errors to identify the exact problem and preserve my entered values, so that fixing a claim is straightforward.

70. As an employee, I want receipt upload to show progress, failure, retry, and completion states, so that I know whether my evidence was received.

71. As an employee, I want to use a device camera or gallery where available, so that receipt capture works naturally on mobile.

72. As an employee, I want a clear missing-receipt exception path, so that I do not have to work around the form when evidence is unavailable.

73. As an approver, I want my inbox to show only work that needs my action by default, so that I can make decisions without sorting through irrelevant records.

74. As an approver, I want to filter, search, sort, and group my approval work, so that I can prioritize urgent or exceptional requests.

75. As an approver, I want the evidence, policy result, approval history, and decision controls in one view, so that I can decide without opening unrelated screens.

76. As an employee, I want one clear status, next action, blocking reason, and owner for my request, so that I always understand what happens next.

77. As a user, I want rejected, skipped, taken over, paid, and adjusted states to be visibly different, so that I understand the consequence of each state.

78. As an employee, I want email notifications to open the exact request and tell me what action is required, so that notifications are useful rather than generic.

79. As a user, I want the application to work with keyboard navigation and assistive technology, so that approval and submission do not depend on a mouse or visual cues.

80. As a mobile user, I want receipt capture, comments, status, and approval to work in a compact layout, so that I can complete common actions away from a desk.

81. As an administrator, I want the visual workflow editor to provide a route preview and validation feedback, so that I can detect bad routing before publication.

82. As an administrator, I want a non-drag alternative for every workflow-editor action, so that workflow configuration remains accessible and usable on different devices.

83. As an administrator, I want to see conflicts, missing approvers, and unreachable workflow behavior before publication, so that a policy change cannot create a blocked process accidentally.

84. As a product owner, I want to measure submission completion, validation failures, upload failures, correction rate, approval time, and mobile completion, so that UX improvements can be evaluated by task success.

## Implementation Decisions

### Application Boundary

The prototype will be a single Next.js App Router application using TypeScript.

The application will contain the user interface, protected server routes, application commands, domain services, and provider adapters.

The browser will not directly mutate workflow, approval, payment, or audit data.

All business mutations will pass through server-side authorization and transaction boundaries.

The primary implementation seam is the server-side application-command boundary.

End-to-end tests will exercise the browser or HTTP client through those commands rather than testing visual implementation details.

### UX and UI Direction

The new application is a substantial UX replacement and must not be a visual port of the legacy Angular application.

The product experience will prioritize task completion, clarity, recoverability, and confidence over exposing every available field at once.

The default expense flow will use a short, single-column, progressive form with autosaved drafts and a final review step.

Policy-specific fields will appear only when relevant, and conditional behavior will not silently erase previously entered values.

Every request view will expose one current status, one next action, one blocking reason, and one responsible actor or stage.

The approval inbox will default to actionable work and separate `Needs my action`, `Waiting`, and `Completed` records.

Decision evidence will be adjacent to decision controls and include amount, currency, dates, requester, receipts, policy result, comments, approval chain, and history.

The interface will distinguish approval, rejection, takeover, Finance verification, payment, and adjustment actions.

The UI will support mobile receipt capture, comments, status review, and approval without reproducing dense desktop tables.

Desktop will be optimized for workflow administration, dense review, and reporting while preserving accessible responsive alternatives.

The product will target WCAG 2.2 Level AA, including keyboard operation, visible focus, logical focus order, accessible names and states, error summaries, status announcements, contrast, target size, and reflow at 320 CSS pixels and 400 percent zoom.

The UI will use a new information architecture, typography, spacing, color, and interaction language rather than carrying forward legacy visual patterns.

The visual system or component library will be selected after a UX prototype confirms accessibility, responsive behavior, and compatibility with the Next.js server and client boundaries.

### UX State Requirements

Expense drafts must autosave and be resumable after navigation or an interrupted session.

Receipt interactions must expose upload, processing, available, failed, and retry states.

The interface must preserve entered values when client or server validation fails.

Submission must show a review-and-confirm step before the request becomes active.

Rejection is always outright and terminal, and must be presented as such rather than as a recoverable state.

Required actions must not rely only on temporary toast notifications.

The request detail view must show the next action and blocking reason without requiring unrelated navigation.

### UX Administration Requirements

The workflow editor must provide a visual route preview and a non-drag interaction path for every action.

The simulator must show the matched workflow, target actors, fallback behavior, conditions, and reasons for a representative employee and claim.

The editor must flag missing approvers, conflicting rules, and unreachable behavior before publication.

Published workflows must support version history and must not silently reroute active requests.

### Production Services

The intended production host is Azure App Service.

The intended database is Azure Database for PostgreSQL.

The intended attachment store is private Azure Blob Storage.

The intended production identity provider is Microsoft Entra ID.

The intended email provider is Microsoft Graph using an approved sender mailbox.

Realtime updates are not required for the MVP.

Azure SignalR or Web PubSub may be added later behind a realtime provider interface.

### Local Services

Local development will use a Docker PostgreSQL container.

Local blob behavior will use Azurite.

Local email behavior will use Mailpit or an equivalent local inbox.

Local authentication will use seeded development identities behind a development-only adapter.

The development authentication path must be impossible to enable in QA or production.

### Supabase

Supabase is not a dependency of the MVP.

The application will use Azure-native services because Entra ID covers internal authentication, Blob Storage covers receipts, and realtime is deferred.

Self-hosted Supabase may be reconsidered if the product later requires its bundled Auth, Storage, Realtime, and database experience and the operational cost is justified.

### Identity and Hierarchy

Every active employee in the company Entra tenant may sign in when production identity integration is available.

First sign-in creates a basic employee record if one does not already exist.

Microsoft Graph may provide display name, email, title, department, and manager suggestions for initial setup.

Graph is not authoritative for approval relationships.

System administrators and HR maintain the application manager relationship, approval roles, and approval pools inside ExpenseHive.

The application stores the organization identifier from the beginning even though the first deployment serves one company.

### Domain Model

The normalized schema will include an organization boundary and at least the following concepts.

- Organization represents the company boundary.
- Employee represents a person who can submit or act in the system.
- HierarchyAssignment represents an application-managed manager relationship.
- ApprovalRole represents an authority such as IT Head, Finance, or CEO.
- ApprovalPool represents eligible people for an approval role.
- CEODelegate represents a person authorized to act for the CEO.
- PermissionRequest represents pre-spend authorization.
- ReimbursementClaim represents repayment for already-spent money.
- ExpenseLine represents one categorized amount in a claim.
- Attachment represents receipt metadata and protected blob location.
- WorkflowTemplate represents a reusable policy for a form type and scope.
- WorkflowVersion represents an immutable published workflow definition.
- WorkflowNode represents an approval, notification, Finance verification, or payment-completion node.
- WorkflowInstance represents the selected workflow version for one request.
- ApprovalStep represents a request-specific stage and assigned authority.
- ApprovalHistoryEvent represents an immutable submission, decision, skip, takeover, or payment event.
- PaymentRecord represents Finance verification and payment completion.
- AdjustmentClaim represents a post-payment correction linked to the original claim.

### Workflow Templates

Permission requests and reimbursement claims will use separate workflow templates.

The system will have one default workflow and may have department-specific workflows.

The first executable path is ordered.

The visual editor will support approval, notification, Finance verification, and payment-completion nodes.

Simple conditions may be attached to nodes or policy rules.

Arbitrary branches, loops, parallel paths, and a general-purpose BPM engine are out of scope for the MVP.

Workflow changes follow a draft, simulate, test, publish lifecycle.

Only published versions receive new requests.

Published versions used by an active request are immutable.

### Approver Resolution

Normal stage target types are application manager, approval role, approval pool, and named user.

Approval roles and pools are preferred for normal stages.

Named users are reserved for exceptional fixed assignments and safe-list membership.

One eligible person completes an ordinary approval pool unless a future workflow explicitly defines another quorum.

An ordinary approver can complete only the stage to which they are authorized.

A higher-stage approver can take over a submitted request and skip all earlier stages.

The CEO and a CEO delegate can take over through the CEO stage.

Every skipped stage is recorded as `Skipped`, not `Approved`.

A takeover requires a reason code.

Self-approval is prohibited for the requester, CEO, delegate, and any other actor.

### Missing Assignments

If a required approver has no application assignment, the request continues to the next configured stage.

The skipped stage records the missing assignment as the reason.

HR and system administrators receive a notification about the missing assignment.

The system must not select an arbitrary person from Microsoft Graph as a fallback.

### Request and Payment Lifecycle

The normal reimbursement lifecycle is submission, configured approval stages, CEO approval, Finance verification, payment marking, and `Approved and paid`.

A CEO or higher-stage takeover skips earlier approval steps and still leaves Finance as the final payment completion action.

A reimbursement without a linked permission request automatically receives an additional Finance review.

A reimbursement amount above its permission amount cannot complete until the excess amount receives approval.

A rejection at any stage, including Finance, is outright and terminal: the rejected request is never edited or resubmitted, and there is no correction or send-back cycle.

An employee may submit a new, distinct claim for the same expense after a rejection; the new claim restarts at the first approval stage like any other claim.

Finance rejects a claim outright, the same as any other stage, when required payment information or evidence is missing or invalid.

The same Finance person may verify and mark payment as paid, but both actions and timestamps must be recorded separately.

Paid claims cannot be directly edited.

Post-payment corrections create a new adjustment claim that links to the original paid claim and requires CEO authorization.

### Audit and Visibility

The history is append-only from the application’s perspective.

History records actor, authority, action, reason code where required, skipped stages, timestamps, workflow version, and related request identifiers.

Employees and authorized approvers can see the complete history for requests they are allowed to view.

The history must distinguish approved, rejected, skipped, taken over, verified, paid, and adjusted outcomes.

### Attachments and Email

Receipt bytes are stored in private Blob Storage.

PostgreSQL stores attachment metadata and protected object references rather than exposing public file URLs.

Email notifications are sent through a provider adapter.

The production adapter will use Microsoft Graph after the required tenant permissions and sender mailbox are available.

The local adapter will deliver mail to Mailpit.

The UI will show attachment progress, failure, retry, and protected availability states.

The first release requires web file selection and a mobile camera or gallery path where the device supports it.

### Application Actions

The server-side application layer will expose behavior equivalent to the following actions.

- Create, update, submit, and withdraw a permission request.
- Create, update, submit, and withdraw a reimbursement claim.
- Link a reimbursement claim to a permission request.
- Approve or reject an assigned approval step.
- Take over a request as a higher-stage authority.
- Approve as CEO or act for CEO through the safe list.
- Manage hierarchy assignments, approval roles, approval pools, and CEO delegates.
- Draft, simulate, publish, disable, and restore workflow versions.
- Refresh initial Graph profile and hierarchy suggestions.
- Verify a claim for payment and mark it paid.
- Create and approve a post-payment adjustment claim.
- Upload, list, preview, and protect claim attachments.
- Read request status, history, approver queue, and payment information.

### State and Concurrency

Every state-changing command must validate the request version and the actor’s current authority.

A command must use the workflow version captured by the request rather than the latest workflow definition.

Concurrent decisions must not allow two actors to complete the same exclusive step.

Repeated commands must be safely rejected or treated as already completed without duplicating history events.

## Testing Decisions

Tests should assert externally observable behavior, authorization, state transitions, persisted history, notifications, and provider interactions.

Tests should not assert React component structure, CSS classes, database implementation details, or internal helper names.

The highest-value seam is the server-side application-command boundary called through protected route handlers.

Browser end-to-end tests should cover the complete critical workflows from the user interface.

Workflow evaluation and authority resolution may have focused domain tests because they encode policy decisions and deterministic transitions.

Provider adapters should have contract tests against local implementations and integration tests against a configured Azure environment when credentials are available.

The legacy repository contains many Angular component specs that mostly verify component creation.

The new project should retain component tests where useful but prioritize application-level and end-to-end behavior tests over creation-only tests.

UX tests should assert task success, visible states, accessible names and actions, preserved data, focus behavior, responsive reflow, and clear recovery paths.

The main flows should be tested at mobile and desktop viewports, including a 320 CSS pixel viewport and 400 percent zoom where the test environment supports it.

Keyboard-only and screen-reader-assisted checks are required for forms, dialogs, workflow editing, approval actions, error summaries, status updates, and attachment controls.

Visual regression checks should cover the primary expense form, approval inbox, request detail, rejected state, workflow editor, and mobile layouts after the initial visual language is established.

Task-based usability checks should measure whether a representative employee can submit a claim, an approver can decide, and Finance can complete payment without instruction from the development team.

The minimum acceptance suite should cover the following scenarios.

1. An employee submits a reimbursement through the default path and Finance marks it `Approved and paid`.

2. An employee submits a multi-line claim and one approval covers the total amount.

3. A reimbursement linked to an approved permission request follows the configured reimbursement workflow.

4. A reimbursement without permission receives an additional Finance review.

5. A reimbursement above its permission amount cannot complete until the excess is approved.

6. A normal approver approves only their assigned stage.

7. One member of an approval pool completes the pool stage.

8. A higher-stage approver takes over a request and all earlier stages become visibly skipped.

9. A CEO delegate acts for the CEO and the history records both the actor and CEO authority.

10. A requester, CEO, or delegate cannot approve their own expense.

11. A missing manager skips to the next configured stage and notifies HR and system administrators.

12. A rejected request becomes terminal, and an employee can submit a new claim for the same expense that starts at the first stage while the rejected request's history remains visible unchanged.

13. Finance rejects a claim outright when required payment information or evidence is missing, and the employee can submit a new claim.

14. Finance verifies and marks payment, and the final status is `Approved and paid`.

15. A paid claim cannot be edited directly.

16. A post-payment adjustment claim links to the original and requires CEO authorization.

17. A workflow draft can be simulated and only a published version can receive new requests.

18. An active request retains its original workflow version after an administrator publishes a new version.

19. An employee and authorized approvers can see the complete request history, while unauthorized users cannot.

20. Attachments are stored through the file provider and are not publicly accessible.

21. Email notifications use Mailpit locally and do not require Graph credentials.

22. The development identity adapter is unavailable outside local development.

23. An employee can complete the default expense flow without seeing irrelevant policy fields.

24. An interrupted draft can be resumed without losing entered values.

25. A failed receipt upload preserves the draft and exposes a retry or replacement action.

26. A failed submission shows an error summary, field-level messages, correct focus behavior, and preserved values.

27. The final submission review exposes the complete claim and allows correction before activation.

28. The approval inbox defaults to actionable work and separates waiting and completed records.

29. The approval detail view exposes decision evidence and the next action without unrelated navigation.

30. Rejection, takeover, payment, and adjustment have distinct labels and outcomes.

31. The key employee, approver, and Finance flows remain usable at a 320 CSS pixel viewport.

32. The key flows remain keyboard operable with visible focus and accessible control names.

33. Required status changes are announced to assistive technology without unexpectedly moving focus.

34. A workflow draft preview explains the route, matched conditions, target actors, fallback, and missing configuration.

35. The workflow editor can be operated without drag and drop.

36. The application records UX outcome metrics without recording receipt contents or unnecessary personal data.

## Out of Scope

Production cutover from the legacy application is out of scope for this prototype.

Importing current production reimbursements, attachments, users, or audit history is out of scope for the first usable version.

Supabase is out of scope as an MVP dependency.

Realtime approval queues are out of scope for the MVP.

Automatic payment execution through a bank or accounting integration is out of scope.

Power BI, legacy reports, and nonessential dashboards are out of scope for the first vertical slice.

Arbitrary workflow branches, loops, parallel approvals, and general BPM behavior are out of scope.

Full multi-company administration is out of scope even though organization identifiers are included in the schema.

Microsoft Graph is not the authoritative source for manager or approval relationships.

High-risk claim rules, exact category routing rules, and legal-entity-specific policy rules are not yet defined.

The exact supplemental approval design for an amount overrun remains a follow-up policy decision.

Automated OCR, receipt matching, email receipt forwarding, and chat or SMS receipt capture are near-term enhancements rather than prerequisites for the first usable version.

Realtime task updates, AI recommendations, advanced analytics, and offline-first mobile capture are later UX improvements.

## Further Notes

The legacy `expensehive` directory is read-only reference material and must not receive implementation files or documentation changes.

The new project lives beside it in `expensehive-next`.

The current legacy backend targets .NET 7 and uses ABP 7.0.1 even though its README describes .NET 8.

The current legacy category implementation controls some fields and an Internet Expense amount limit but does not route approvals by category.

The first implementation should establish the domain model, local infrastructure adapters, seeded identities, and reimbursement vertical slice before adding production identity or Graph synchronization.

Remaining policy decisions should be recorded as follow-up ADRs rather than silently resolved in application code.

The UX research record is maintained in `docs/ux/ux-research.md`.

The research emphasizes that ease of use is measured by successful task completion, low correction effort, clear recovery, and accessible interaction rather than visual novelty alone.
