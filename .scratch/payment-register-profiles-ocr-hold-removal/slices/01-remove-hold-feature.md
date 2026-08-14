# 01 - Remove the hold feature

**What to build:** The hold feature (ADR-0016) is removed completely from the application. A claim can no longer be paused at any stage: no hold or resume actions, no Held status or badge, no held-claims admin view, no hold privilege toggle, and no absence-sweep hold exemption. The only correction path is rejection followed by a new claim. Persisted held claims are auto-resumed by a migration with an audit note. The approver dashboard loses its "my holds" card.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

References: ADR-0026 (docs/architecture/decisions/0026-remove-the-hold-feature.md), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (work item 6, stories 40-47), CONTEXT.md (Hold = retired). The hold feature shipped via ADR-0015/0016/0017/0018/0020 - see those ADRs for what exists.

## Removal inventory (search for `held` and `hold` across the codebase)

- Domain: `src/server/expenses/commands.ts` - `holdClaim`, `resumeClaim`, the held-claims view command, the "held and cannot be acted on" freeze checks on every action, `held`/`resumed` history events.
- Ports/read model: `src/server/expenses/ports.ts` - `heldAt`/`heldBy`/`heldReason` on the claim, the held-claims view row, `held`/`resumed` history kinds, `held` claim status.
- Stores: `src/server/expenses/postgres.ts` (columns held_at/held_by/held_reason, queries), `src/server/expenses/in-memory.ts`.
- Absence sweep: `src/server/expenses/absence-skip.ts` - the `if (claim.heldAt) return false;` exemption (and the sweep worker if it references holds).
- Dashboard read models: `src/server/expenses/dashboard-read-models.ts` - `holdClaimIds` and the approver "my holds" aggregate.
- PDF: `src/server/expenses/summary-pdf.ts` - held rendering.
- Authorization: `src/server/shared/authorization.ts` - the `canHold` capability; the privilege catalog loses the hold toggle (stays at five toggles for now; the bank-approval toggle arrives in slice 04 - do NOT add it here).
- API routes: `src/app/api/expenses/[id]/hold/route.ts`, `src/app/api/expenses/[id]/resume/route.ts` - delete both.
- Admin: `src/features/admin/held-section.tsx` (+ its test) - delete; the admin role editor's hold toggle; any held references in admin pages.
- Dashboard UI: `src/features/dashboard/expense-drawer.tsx` (hold/resume actions), `dashboard-stats.ts` ("my holds" card and its CTA), `dashboard-attention.ts` (the held filter), `expense-read-model.ts`, `journey-flow.tsx`/`journey-meta.ts` (held/resumed timeline entries), `mock-data.ts` (held fixtures), `full-expense-list.tsx`, `expense-table.tsx`, `status-badge.tsx` (Held badge).
- Payment queue: `src/features/finance/payment-queue-table.tsx` and columns (held badge / frozen treatment).
- Seed data and fixtures: `scripts/seed.mjs` and any dev fixtures with held claims.

## Migration

- New forward-only SQL migration `db/migrations/0030_remove_hold_state.sql`: drop the `held_at`/`held_by`/`held_reason` columns, remove `held` and `resumed` from the history kind CHECK constraints, and record an audit note per previously-held claim (append a history event recording the auto-resume, e.g. kind `comment` with a "Hold feature removed; claim auto-resumed" detail) BEFORE dropping the columns.
- The migration must apply cleanly on a fresh database AND on a database seeded with held claims (run `npm run db:migrate` and `npm run db:seed` to verify).

## Acceptance criteria

- [ ] No hold/resume action exists anywhere in the UI or API; the drawer shows only approve/reject/verify/pay/delegate actions.
- [ ] The held-claims admin section and its route are gone; the role editor no longer offers a hold toggle.
- [ ] The absence sweep applies to every pending claim; there is no hold exemption anywhere.
- [ ] Claims previously held in the database become actionable after migration, with an audit note in history.
- [ ] The approver dashboard card set no longer references holds (re-tuned around awaiting-my-action and aging).
- [ ] The journey timeline, status badges, expense drawer, expense read model, payment queue, activity feed, and PDF summary never render a held state.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Update/extend `src/server/expenses/commands.test.ts`, `postgres.test.ts`, `dashboard-read-models.test.ts`, `absence-sweep.test.ts`, and the dashboard/finance component tests that referenced holds - remove or rewrite held scenarios (e.g. "held claim is frozen" becomes a non-existent case).
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: server-side command boundary for mutations, history is append-only, WCAG 2.2 AA in UI, no em dash characters, follow existing test patterns (dashboard tests use `mock-data.ts` fixtures).
