# ADR-0027: Role-Adaptive Dashboard Layouts

Status: accepted.

## Context

The dashboard already adapts its stat-card set to the viewer's role (ADR-0020), but the page layout below the cards is identical for everyone: the expense overview and the "needs your attention" card sit side by side in the same two-column arrangement for every role.
A Finance Executive's primary surface is the claims waiting on them, yet their attention card competes with the expense list; an employee's attention card is usually empty while their expense list is the whole point.

## Decision

1. **Hardcoded per-role layouts.**
   Dashboard component order and sizing are hardcoded per viewer role; they are not admin-configurable.
   - Employee: the expense list is the primary surface, full width; the attention card appears only when it has content.
   - Approver and Finance: the "needs your attention" card renders first and wider, with the expense list below it.
   - Superadmin: admin-first default.
2. **Data-driven underneath.**
   The layout is expressed as a per-role component map in one place so that future admin configurability can be layered on without rewriting the dashboard.
3. **Scope.**
   The tuning covers the dashboard page only; other pages keep their current structure.

## Consequences

The dashboard reads differently per role without any admin configuration burden.
The approver dashboard card set loses "my holds" with the hold removal (ADR-0026) and is re-tuned around awaiting-my-action and aging.

## Revisit When

If companies ask to reorder their own dashboards, the component map can be promoted to a per-company setting.
