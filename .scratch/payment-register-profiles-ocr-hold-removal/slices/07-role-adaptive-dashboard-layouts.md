# 07 - Role-adaptive dashboard layouts

**What to build:** The dashboard page layout below the stat cards becomes role-adaptive: component order and sizing are hardcoded per viewer role, expressed as a single per-role component map. Employee: expense list full-width first, attention card only when it has content. Approver and Finance: "needs your attention" first and wider, expense list below. Superadmin: admin-first default. The approver card set is already re-tuned by slice 01 (my holds card removed).

**Blocked by:** 01 - Remove the hold feature (the approver card set changes with hold removal).

**Status:** ready-for-agent

References: ADR-0027 (docs/architecture/decisions/0027-role-adaptive-dashboard-layouts.md), ADR-0020 (role-adaptive card sets - the current baseline), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (stories 18-22), CONTEXT.md (existing dashboard terms).

## What to change

- The dashboard (`src/features/dashboard/dashboard.tsx` renders period switch, stat cards, `ExpenseOverview` (expense list + "needs your attention" card side by side), `MyActivity`, drawer).
- Introduce a per-role layout map in one place that decides order and sizing for the dashboard's main components (overview/attention/activity), driven by the viewer's role (employee / approver / finance / superadmin). Keep it data-driven (a small declarative structure), not a tangle of conditionals.
- Employee: expense list is the primary surface (full width), the attention card appears only when it has items.
- Approver and Finance: "needs your attention" renders first and wider, the expense list below it.
- Superadmin: admin-first default (keep the current arrangement or a sensible default).
- The period switch and stat cards keep their current role-adaptive behavior (ADR-0020). The activity feed placement may follow the map.
- The layout must remain responsive (WCAG 2.2 AA: no reflow breakage at 320px, keyboard ordering sensible).

## Acceptance criteria

- [ ] Each role sees a different, sensible dashboard arrangement per the rules above.
- [ ] The employee's attention card disappears when empty; it never renders as an empty panel.
- [ ] The layout is expressed via one declarative per-role component map, not scattered conditionals.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Unit tests for the layout map (each role resolves to the right order/sizing; unknown role falls back to a default).
- Component tests: employee renders expense-first and no empty attention card; finance/approver render attention-first; superadmin default (extend `dashboard.test.tsx` patterns).
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: no em dash characters, follow existing patterns.
