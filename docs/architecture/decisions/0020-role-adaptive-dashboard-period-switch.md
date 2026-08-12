# ADR-0020: Role-Adaptive Dashboard with Period Switch

Status: accepted.

## Context

The dashboard at `/expenses` is a single viewer-scoped view: four money cards (spent this month, awaiting decision, rejected, reimbursed this month), a compact claims list, and an activity feed.
Industry practice (Zoho Expense, Expensify, Ramp) differentiates what employees, approvers, and finance see: employees get spend plus outstanding/draft tasks, approvers get a "needs my action" feed plus backlog health, and finance gets queue, aging, and payout metrics.
The company wants the whole dashboard to respond to a month / year / overall period choice, and asked for a research-backed card set that stays clutter-free.

## Decision

1. **The dashboard becomes role-adaptive.** The same route renders different card sets and lists by the viewer's role:
   - **Employee:** spent (period), pending reimbursements (amount + count, not just a count), drafts needing completion (task CTA), reimbursed (period).
   - **Approver:** awaiting my action (count + total), my holds (with quick resume, ADR-0016), aging - claims stuck at a stage beyond the configured absence timeout (ADR-0018).
   - **Finance:** the same clean four-card pattern, adapted - queue awaiting verification/payment, paid out (period), aged claims, rejected (period).
   - **Superadmin:** admin console remains the home; no new dashboard cards. In practice the capability-driven mapping resolves Superadmin to the finance card set on the `/expenses` route (Superadmin holds every capability by construction, ADR-0015), which is the same "no new cards" guarantee - the finance set already exists and no card is added for Superadmin's sake. Superadmin's home stays the admin console.
2. **The period switch is a first-class control on the whole dashboard:** month / year / overall, defaulting to the current month (research favors narrow defaults; "overall" is available but not the default).
   Selecting a period re-computes cards, the claims list, and the activity feed together; the choice is preserved across visits.
3. **Every card passes a decision test:** it must inform an action (act on my queue, resume a hold, chase an aged claim). Vanity metrics are excluded.
4. Role-scoped data is produced by server-side read models (approver and finance aggregates), not by re-filtering the viewer's own workspace list.

## Consequences

The dashboard read path gains per-role aggregates; `dashboard-stats.ts` is replaced by role-specific stat modules.
The period switch needs persisted preference state and consistent date bucketing across cards and lists.
The four-card grid and bento layout stay, keeping the UI as clean as today.

## Revisit When

If Superadmin later wants an org-wide finance overview, it becomes a dashboard variant rather than admin-console content.
