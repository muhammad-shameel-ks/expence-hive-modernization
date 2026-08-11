# ExpenseHive Approval Workflow Revamp

Status: proposed implementation baseline.

This specification synthesizes the decisions from the plan-maxxing grilling session on role privileges, user creation, holds, delegation, the absence auto-skip setting, the dashboard, and expense filters.
The architecture decisions ADR-0015 through ADR-0021 record the individual decisions; this document is the product-level baseline that ties them together.

## Problem Statement

Role authority is hardcoded in a capability map (`CAPABILITIES_BY_ROLE_CODE`): five predefined roles and a non-assignable Superadmin, with custom roles resolving to submit-only.
The administrator cannot create users - people only enter through seeded identities and first-sign-in provisioning - and cannot control what a role may do without a deployment.

The absence auto-skip (`ABSENCE_TIMEOUT_MS = 3 days` in `commands.ts`) is a compile-time constant, is evaluated only lazily when a claim is read, and cannot be tuned per company.

There is no way to pause a claim at any stage, and the existing takeover feature (apex bypass and positional bypass) lets approvers jump ahead and act, which contradicts the requirement that the administrator only ever re-routes work, never acts on it.

The dashboard is a single viewer-scoped view with four static month-scoped cards, no period control, and no differentiation between what an employee, an approver, and finance should see.
Expense filtering exists only on `/expenses/all` with grouped chips; the dashboard has no filter section, and statuses such as Approved, Paid, and Rejected are not directly reachable.

## Solution

Seven connected work items, delivered in dependency order: the role model first, because holds, delegation, and the sweep job all hang off it.

### 1. Per-role privilege toggles (ADR-0015)

- Capabilities move from the hardcoded code-keyed map to per-role data stored with each role record; `resolveRoleCapabilities` resolves from the role record, and unknown/absent roles default to submit-only.
- The privilege catalog is fixed at six toggles: submit claims, approve/reject, finance verify/pay, hold claims, view org-wide activity, access the admin console.
- Delegation and company auto-skip configuration are Superadmin-only built-ins and are never toggles.
- The five predefined roles are editable (locked means not deletable, not not editable); custom roles are created with a name and privilege set and participate in flows.
- Removing an action privilege while claims are pending at that role's steps warns the administrator with the full list of affected claims, and the pending steps auto-skip to the next level on the next sweep.
- Client-side capability mirrors are driven from the same role data.

### 2. Admin user creation and department heads (ADR-0019)

- Departments require a manager (head); department creation and management include assigning the head, and existing headless departments are surfaced as incomplete.
- The admin user-creation flow takes name, email, role, and department; the manager field is locked to the department head, so a headless department blocks creation until an admin assigns it a head.
- Bulk CSV import creates many users with the same defaults and row-level validation feedback.
- Created users are pre-provisioned records picked up at first sign-in; provisioning reconciles with pre-created records (match on identity, never overwrite admin-set assignments).

### 3. Company-wise absence auto-skip setting (ADR-0018)

- The 3-day absence timeout becomes one configurable value per company, set by Superadmin in a new admin settings section; existing organizations default to 3 days.
- The vacant-stage skip stays immediate; held claims are exempt from the timeout.
- A scheduled sweep job - a new worker container in `compose.yaml` - scans in-flight claims across organizations and applies the same `catchUpAbsentStages` logic; the lazy read-path catch-up stays as a backstop.
- The skip detail in history names the configured value (e.g. "no response within N days").

### 4. Hold state on claims (ADR-0016)

- Holding is a per-role privilege; a holder can pause a claim at any stage where they are the current actor, with a required reason recorded as a `held` history event; resuming records a `resumed` event.
- Held claims keep their flow position, render a Held badge everywhere, and are frozen against terminal actions.
- The current stage actor can resume; Superadmin keeps a held-claims oversight view; the absence sweep never auto-skips a held claim.

### 5. Delegation replaces takeover (ADR-0017)

- Takeover is removed completely (no apex bypass, no positional bypass).
- Delegation is Superadmin-only: re-point an in-flight claim's task to any specific person with a required reason, recorded as a `delegated` event plus one `skipped` event per intermediate step.
- A target whose role sits later in the claim's frozen steps auto-skips the intermediate pending steps and lands the claim at that step; any other target acts at the current stage - only the person changes.
- All stages are delegatable, including finance verify/pay; delegating a held claim does not clear the hold.

### 6. Role-adaptive dashboard with period switch (ADR-0020)

- The dashboard becomes role-adaptive: employee, approver, and finance views with research-backed card sets.
  - Employee: spent (period), pending reimbursements (amount + count), drafts needing completion, reimbursed (period).
  - Approver: awaiting my action (count + total), my holds (with quick resume), aging - claims stuck beyond the configured absence timeout.
  - Finance: the same clean four-card pattern adapted - queue awaiting verification/payment, paid out (period), aged claims, rejected (period).
- A period switch (month / year / overall, defaulting to month) re-computes cards, the claims list, and the activity feed together and persists across visits.
- Role-scoped data comes from server-side read models, not from re-filtering the viewer's own workspace list.

### 7. Unified expense filter and sort section (ADR-0021)

- One shared filter/sort component on the dashboard and `/expenses/all`: quick chips one-per-status (All, Draft, Submitted, In approval, Approved, In finance, Paid, Rejected) plus the advanced layer (search, category, amount range, date range, column sort).
- Filter state is URL-synced so views survive refresh and navigation.
- UI/UX is first-class: compact on desktop, collapsible affordance on mobile, WCAG 2.2 AA, never crowding the list.

## User Stories

### Roles and privileges

1. As a Superadmin, I want to edit the privilege toggles of the five predefined roles, so that I can tune authority without a deployment.
2. As a Superadmin, I want to create custom roles with a name and a privilege set, so that the company's structure can be expressed directly.
3. As a Superadmin, I want a warning listing every pending claim when I remove an action privilege, so that I can see the impact before confirming.
4. As a Superadmin, I want the delegate and company auto-skip powers to be reserved to me, so that re-routing authority never lands in a toggle.
5. As an employee, I want my role's capabilities reflected consistently in every screen, so that the UI never offers actions the server will reject.

### Users and departments

6. As a Superadmin, I want to create a department with a required head, so that new members have a manager to default to.
7. As a Superadmin, I want to create a user with name, email, role, and department, so that the person can sign in and start working.
8. As a Superadmin, I want the manager locked to the department head at creation, so that every new person has a correct manager from day one; I can still change it afterward via the existing manager assignment.
9. As a Superadmin, I want to bulk-import a CSV roster, so that onboarding a batch of users is one action.
10. As an employee, I want to sign in with company identity after being created, so that I need no invitation or extra step.

### Absence auto-skip

11. As a Superadmin, I want to change the absence timeout value per company, so that each organization controls its own approval cadence.
12. As a Superadmin, I want the timeout enforced by a scheduled sweep even when nobody opens the app, so that stale claims advance on time.
13. As a Finance Head, I want held claims to never be auto-skipped, so that an explicit hold always outranks the timeout.

### Holds

14. As an approver with the hold privilege, I want to hold a claim at my stage with a reason, so that I can pause work while gathering information.
15. As the current stage actor, I want to resume a held claim, so that work continues from the same position.
16. As a Superadmin, I want a held-claims oversight view, so that abandoned holds are visible and actionable.
17. As a requester, I want to see my claim's Held status and the reason, so that I understand why it is paused.

### Delegation

18. As a Superadmin, I want to delegate any in-flight claim to any person with a required reason, so that unavailable or departed assignees never block the flow.
19. As a Superadmin, I want a delegation to a later stage position to auto-skip the intermediate steps, so that the claim lands where the flow intends.
20. As a Superadmin, I want the delegation recorded with full audit events, so that the trail names the delegator, target, reason, and skipped steps.
21. As a delegatee, I want to act on a claim delegated to me, and to resume it if it was held, so that the flow continues without the original assignee.

### Dashboard

22. As an employee, I want a dashboard with spent, pending, drafts, and reimbursed for the selected period, so that I know my money position and next actions.
23. As an approver, I want a dashboard with my action queue, my holds, and aging, so that I can prioritize without hunting through lists.
24. As a finance user, I want a dashboard with queue backlog, paid out, aged, and rejected for the selected period, so that payout health is one glance away.
25. As any user, I want a month/year/overall period switch that recomputes the whole dashboard, so that trends and totals are comparable.

### Filters

26. As any user, I want one-per-status filter chips including Approved, Paid, and Rejected, so that every status is directly reachable.
27. As any user, I want search, category, amount, and date filters plus sorting on every expense list, so that I can find any claim.
28. As any user, I want my filter state preserved in the URL, so that a filtered view survives refresh and can be shared.

## Out of Scope

- Email notifications (issue #19 was deleted as stale; no email infra exists yet).
- Permission request (pre-spend authorization) workflow - a separate future track.
- Payment-queue filter changes: the queue keeps its own column-driven filters (ADR-0008).

## References

- ADRs: 0015 role privilege toggles, 0016 hold state, 0017 delegation replaces takeover, 0018 company absence auto-skip, 0019 user creation and department heads, 0020 role-adaptive dashboard, 0021 unified expense filters.
- Domain glossary: `CONTEXT.md` (Delegation, Hold, Absence auto-skip, Privilege toggle, Department head).
- UX baseline: `docs/ux/ux-research.md`.
