# 01 - Shared amount-guard module (dedupe foundation)

**What to build:** One canonical home for amount-guard semantics, so the client, the expenses command layer, both postgres mappers, and the admin HTTP layer all import from a single source instead of maintaining verbatim copies.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

## Context

The review found the following duplicated code:

1. `guardSatisfied`, `GUARD_FAIL_PHRASES`, `rupeesToMinor`, `minorToRupees`, `formatGuardAmount`, `GUARD_OPERATOR_LABELS`, `GUARD_OPERATORS` live in `src/features/admin/flow-guard.ts` (client) AND `guardSatisfied` + `GUARD_FAIL_PHRASES` + `autoSkipDetail` formatting are re-implemented in `src/server/expenses/commands.ts` (~line 2064-2090). The comment in flow-guard.ts admits "matches the server-side reason phrasing".
2. The guard row→type mapping is duplicated in `src/server/admin/postgres.ts` (~1618-1624) and `src/server/expenses/postgres.ts` (~2427-2432).
3. The operator list recurs in `src/features/admin/flow-guard.ts`, `src/server/admin/http.ts` `parseGuard` (~1375), and the SQL CHECK in `db/migrations/0021_amount_guard.sql`.
4. The `AmountGuard` / `AmountGuardOperator` types live in `src/server/admin/ports.ts` but are imported by `src/server/expenses/ports.ts` and `src/features/admin/flow-guard.ts` - a cross-feature layering smell.

## What to build

- Create `src/server/shared/amount-guard.ts` (alongside `authorization.ts`) exporting:
  - `AmountGuardOperator` and `AmountGuard` types (moved from `src/server/admin/ports.ts`; re-export from `admin/ports.ts` if needed to keep existing imports working, then update all importers to the shared home)
  - `GUARD_OPERATORS` (the 4-operator array)
  - `GUARD_OPERATOR_LABELS` (display labels)
  - `GUARD_FAIL_PHRASES` (the "under"/"at or under"/"above"/"at or above" phrases used in user-facing skip reasons)
  - `guardSatisfied(guard, totalMinor)`
  - `rupeesToMinor`, `minorToRupees`, `formatGuardAmount` (rupees display helpers)
  - `autoSkipDetail(totalMinor, guard, stepRoleName)` - the server's user-facing reason string builder, e.g. "Total ₹300 under ₹5000 guard on Finance Head step" (currently in commands.ts)
  - `guardFromRow(row)` / row mapping helper used by both postgres mappers (or a shared mapping function if the two row shapes allow it - if they genuinely differ, document why)
- Update ALL consumers to import from the shared module: `src/features/admin/flow-guard.ts`, `src/server/expenses/commands.ts`, `src/server/admin/http.ts`, `src/server/admin/postgres.ts`, `src/server/expenses/postgres.ts`, `src/features/admin/flow-section.tsx`, `src/features/admin/flow-guard.test.ts`.
- `src/features/admin/flow-guard.ts` becomes a thin re-export (or is deleted if nothing else is in it - check what else it holds, e.g. `simulateRoute` stays where it is if client-only).
- The `simplifyAutoSkipDetail` regex in `src/features/dashboard/journey-meta.ts` is fragile coupling: if the phrase knowledge now lives in the shared module, consider exporting a shared simplify/parse function OR keep the regex but ensure it's tested against the shared `autoSkipDetail` output. Prefer the shared function if clean.
- NO behavior change. All existing tests must pass unchanged. Do NOT touch the SQL CHECK constraint (data-layer duplication is acceptable and intentional there - document this in a comment if useful).

## Acceptance criteria

- [ ] `src/server/shared/amount-guard.ts` exists with all guard semantics
- [ ] No duplicated guard logic remains in commands.ts / flow-guard.ts / postgres mappers / http.ts
- [ ] `AmountGuard` type imported from the shared home everywhere
- [ ] Existing tests still pass (flow-guard.test.ts, commands.test.ts, admin tests, journey-meta.test.ts)
- [ ] `npm run lint` and `npm run build` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- Test: `npm test` runs vitest; targeted: `npx vitest run src/features/admin/flow-guard.test.ts src/server/expenses/commands.test.ts src/server/admin/http.test.ts src/server/admin/postgres.test.ts src/server/expenses/postgres.test.ts src/features/dashboard/journey-meta.test.ts`
- Lint: `npm run lint`; build: `npm run build`
- No comments unless they explain non-obvious design decisions (this repo uses comments sparingly but DOES use them for domain rationale - see flow-guard.ts, journey-meta.ts)
- Business mutations must stay server-side; this slice is pure refactor, no behavior change
