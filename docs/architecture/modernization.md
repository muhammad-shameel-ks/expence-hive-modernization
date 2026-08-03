# ExpenseHive Modernization Architecture

Status: working discovery draft.

This document records the current modernization direction.

It is intentionally separate from the approval-workflow domain model.

## Current Direction

- The project is a greenfield replacement candidate rather than an immediate production migration.
- The first application will use Next.js as a full-stack application.
- The browser will send business mutations to protected Next.js server routes.
- The new application will use a new normalized database structure.
- The first usable prototype will use new test data rather than importing production history.
- The first vertical slice is reimbursement end to end.
- The first vertical slice includes workflow, CEO override, Finance payment, audit history, receipts, and email.
- Existing Microsoft Entra ID remains the intended production identity provider.
- Every employee in the company tenant may sign in once production identity integration is available.
- A first sign-in creates a basic employee record that an administrator can complete later.
- Microsoft Graph supplies initial profile and hierarchy suggestions for the administrator.
- ExpenseHive remains authoritative for the approval hierarchy after the initial Graph data is loaded.
- A visual workflow editor is required for the administrator experience.
- The first workflow editor uses separate pre-spend and reimbursement templates.
- The first workflow editor saves drafts, provides a simulator, and publishes immutable versions.
- The first executable workflow path is ordered even though the editor supports common node types.
- The initial node types include approval, notification, Finance verification, and payment completion.
- The first version does not require realtime updates.
- The UI and UX are a substantial redesign rather than a visual port of the legacy Angular application.
- Ease of use is measured by task completion, low correction effort, clear recovery, and accessible interaction.
- The primary UX target is WCAG 2.2 Level AA.
- Mobile prioritizes receipt capture, correction, comments, status, and approval.
- Desktop prioritizes workflow administration, dense review, and reporting.
- The approval inbox is action-focused and separates work requiring action from waiting and completed records.
- Local development will use seeded local users, Docker PostgreSQL, Azurite, and Mailpit.
- The new schema includes an organization identifier from the beginning.
- System administrators and HR maintain hierarchy assignments.
- System administrators publish workflow versions.
- Employees and authorized approvers can see complete request history.
- A higher approval stage may take over a submitted request and skip earlier stages.
- One eligible member of an approval pool completes its stage.
- Missing hierarchy assignments notify HR and system administrators after the request continues.
- Paid records are corrected through new adjustment claims rather than direct edits.
- The final employee-facing status is `Approved and paid`.
- Azure App Service is the intended production host for the Next.js application.
- Azure Database for PostgreSQL is the intended production database.
- Azure Blob Storage is the intended production receipt store.
- Microsoft Graph is the intended production email provider unless that decision changes later.
- Provider adapters should separate domain code from local, Azure, and future service implementations.

## Recommended Production Shape

```text
Employee browser
    |
    v
Next.js App Router application
    |-- server-side domain and authorization modules
    |-- protected route handlers
    |-- visual workflow administration
    |-- email and file provider adapters
    |
    |--> Azure Database for PostgreSQL
    |--> Azure Blob Storage
    |--> Microsoft Entra ID
    |--> Microsoft Graph
    `--> Azure SignalR or Web PubSub later, if realtime is needed
```

The browser should not directly mutate workflow, approval, payment, or audit tables.

The server should validate the current actor, the request version, the active workflow version, and the allowed transition in one transaction.

Post-payment corrections should create a new CEO-authorized adjustment claim rather than edit the paid request.

The MVP should use normal refreshes and email notifications instead of adding realtime infrastructure.

Azure SignalR or Web PubSub can be introduced behind the realtime provider adapter when live queues become a real requirement.

## UX Architecture

The application should establish a new information architecture, typography, spacing, color, and interaction language instead of carrying forward legacy visual patterns.

The default expense flow should be a short, single-column, progressive form with autosaved drafts and a review-and-confirm step.

Policy-specific fields should appear only when relevant and must not silently erase previously entered values.

Every request view should expose its current status, next action, blocking reason, and responsible actor or stage.

The approval inbox should default to actionable work and separate `Needs my action`, `Waiting`, and `Completed` records.

Decision evidence should sit beside decision controls and include requester, amount, currency, dates, receipts, policy result, comments, approval chain, and history.

The interface should distinguish approve, request changes, reject, takeover, verify, pay, and adjust actions.

The request detail view should make the next action available without forcing users through unrelated navigation.

Receipt interactions should show upload, processing, available, failed, and retry states.

The application should provide an explicit missing-receipt exception path.

Required actions should not depend on temporary toast notifications.

The design system should provide semantic controls, visible focus, correct labels and states, keyboard operation, accessible status messages, and responsive alternatives for dense tables.

The main flows should reflow at 320 CSS pixels and 400 percent zoom without losing information or requiring two-dimensional scrolling.

The component library should be selected after a prototype evaluates accessibility, responsive behavior, visual quality, and compatibility with Next.js server and client boundaries.

The visual workflow editor should support route preview, validation, conflict detection, a non-drag interaction path, and draft-test-publish behavior.

The product should instrument completion rate, time to submit, validation failures, upload failures, correction rate, approval time, mobile completion, and abandoned drafts without recording receipt contents or unnecessary personal data.

## Local Development Shape

```text
Next.js application
    |--> local PostgreSQL container
    |--> Azurite Blob emulator
    |--> Mailpit email inbox
    `--> seeded development identity provider
```

The development identity provider must be enabled only in a local development environment.

It must never be an available authentication path in QA or production.

Seeded users should cover an employee, ordinary approvers, Finance, the CEO, and CEO delegates.

Local development should also exercise loading, empty, upload-failure, stale-record, permission-denied, server-error, and interrupted-session states.

## Supabase Decision

Supabase is not required for the MVP.

Entra ID covers internal authentication, Azure Blob Storage covers receipts, and realtime is future scope.

Self-hosted Supabase would introduce a multi-service platform to operate before the product needs its realtime feature.

Managed Supabase would place a core production dependency outside the preferred Microsoft subscription boundary.

Supabase can be reconsidered if its combined Auth, Storage, Realtime, and database experience becomes more valuable than the Azure-native approach.

## Provider Adapters

The application should define narrow interfaces for identity, file storage, email, and realtime publication.

The local implementation should use seeded users, Azurite, and Mailpit.

The production implementation should use Entra ID, Azure Blob Storage, Microsoft Graph email, and no realtime provider initially.

The domain layer should not import Supabase, Azure SDKs, or browser-only libraries directly.

## Visual Workflow Editor Direction

Use a visual canvas to make the ordered path understandable without starting with an unrestricted business process engine.

Represent approval, notification, Finance verification, and payment completion as distinct node types.

Attach simple conditions to nodes or rules before introducing arbitrary branches, loops, and parallel paths.

Allow the simulator to evaluate a sample employee, organization, form type, category, and amount against a draft workflow.

Require a draft, test, publish lifecycle for workflow changes.

Treat each published workflow as immutable after requests begin using it.

### Remaining Visual Editor Questions

- Which fields define a node, such as title, target, reason requirement, and higher-stage override behavior?
- Who may disable and restore published workflow versions?
- Should published workflow versions support an explicit rollback action?

## Architecture Questions

- Which Microsoft Entra application registration and Graph permissions can be obtained for the eventual production environment?
- Will Azure Database for PostgreSQL and Blob Storage be available when deployment begins, or should a temporary Azure VM fallback be planned?
- What retention period and export requirements apply to approval and payment history?
- Which email sender mailbox should Microsoft Graph use in production?
- Which existing reports or Power BI dashboards must be reproduced after the MVP?
- Which component library, if any, best meets the UX and accessibility requirements after prototyping?
- Which representative employees and approvers should participate in task-based usability checks?
