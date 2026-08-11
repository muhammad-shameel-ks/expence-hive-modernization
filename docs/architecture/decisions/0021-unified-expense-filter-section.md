# ADR-0021: Unified Expense Filter and Sort Section

Status: accepted.

## Context

Filtering exists only on the full list at `/expenses/all`, and only as grouped quick chips (All / Needs action / In progress / Paid) plus an advanced popover for category, amount range, and date range.
The dashboard at `/expenses` has no filter section at all.
The company wants approved, paid, and rejected filters on the expenses pages, and a single well-designed filter experience everywhere instead of per-page variants.

## Decision

1. **One shared filter/sort component is used on every expense-list surface** - the dashboard and `/expenses/all` - so behavior and visuals never drift.
2. **Quick chips are one-per-status** (All, Submitted, In approval, Approved, In finance, Paid, Rejected) replacing the grouped chips, so every status is directly reachable.
   Grouped intents (needs action, in progress) that prove useful remain expressible through the advanced filter layer.
3. **The advanced layer keeps search, category, amount range, date range, and column sort**, layered on top of the status chips.
4. **Filter state is shareable via the URL** (query params) so a filtered view survives refresh, navigation, and can be linked.
5. **UI/UX is a first-class requirement** (per `docs/ux/ux-research.md` and WCAG 2.2 AA): the section must be compact on desktop, collapse to a clean affordance on mobile, and never crowd the list.

## Consequences

`ExpenseTable`'s filter state and the `ExpenseFilter` quick-chip model change; `expense-query.ts` gains per-status matching.
Dashboard and full list share the same component and URL-synced state.
The payment queue keeps its own column-driven filters (it is a different surface with different semantics, ADR-0008).

## Revisit When

If the payment queue later needs the same quick chips, the shared component is adopted there instead of a parallel implementation.
