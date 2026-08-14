# 05 - Verified-only payment queue and org-wide finance list

**What to build:** The payment queue (`/finance/payments`) renders only claims in the verified state - the ADR-0008 rejected-claims-in-queue treatment is removed, and nothing else (draft/submitted/approved/rejected/paid) appears in the queue. Finance gains a new org-wide expense list view showing every claim in the organization at every stage, reusing the unified one-per-status filter component (ADR-0021). `/expenses/all` stays viewer-scoped.

**Blocked by:** 01 - Remove the hold feature (the queue currently renders held claims with badges; slice 01 removes that surface first).

**Status:** ready-for-agent

References: ADR-0023 (docs/architecture/decisions/0023-payment-register-round-trip.md), ADR-0008 (superseded treatment), ADR-0021 (unified filters), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (stories 1, 12, 13), CONTEXT.md (Payment queue, Org-wide finance list view).

## What to change

- Payment queue query/read model: restrict to verified claims. The queue keeps its column-driven filters (search, category, amount, date, sort - ADR-0008's filter surface stays) but every row is payable. Rejected claims no longer render in the queue at all.
- Check `src/features/finance/payment-queue-query.ts`, `payment-queue-table.tsx`, `payment-queue-columns.tsx`, and the server-side queue read for where rejected/paid rows enter and remove the non-verified ones. Existing queue Excel exports (ADR-0010) keep working, now over a verified-only view.
- Org-wide finance list: a new finance route (e.g. `/finance/expenses`) backed by a server-side org-wide query gated on the `view org-wide activity` privilege (finance roles carry it). Reuse the unified filter/sort component (`src/features/dashboard/expense-filter-section.tsx` one-per-status chips + advanced layer) and an expense table. This is the "see every stage of every expense" surface; it must not mutate anything.
- Wire the new view into the finance navigation/header so it is reachable alongside payments and organization activity.

## Acceptance criteria

- [ ] The payment queue shows only verified claims; no rejected, paid, draft, or in-approval rows appear.
- [ ] Queue filters and sorting still work; the existing queue Excel exports still work over the queue.
- [ ] A new org-wide finance list shows every claim at every stage with the one-per-status chips (All, Draft, Submitted, In approval, Approved, In finance, Paid, Rejected) plus the advanced filters, reachable from finance navigation.
- [ ] The org-wide view is read-only and gated on the view-org-wide-activity privilege; `/expenses/all` remains viewer-scoped.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Read-model/query tests: queue returns verified only; org-wide query returns all statuses for authorized viewers, rejects unauthorized ones.
- Component tests: queue table without rejected/held rendering, org-wide list with chips and advanced filters (reuse existing filter-section tests as prior art).
- Route/page tests where the app uses them.
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
