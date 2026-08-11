# 01 - Flow step guard model + admin validation

**What to build:** The Superadmin can define an amount guard on any flow step (except the terminal one) and the system refuses to publish unsafe guard configurations. This makes the guard shape real end-to-end on the admin side: persisted in PostgreSQL, round-trips through the admin commands, and is validated before a flow can be published.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [ ] `FlowStepInput` carries an optional guard: `{ operator: "gte" | "gt" | "lte" | "lt"; amountMinor: number }` (nullable, absent = no guard). Both step kinds (`role`, `team-lead`) can carry one.
- [ ] New PostgreSQL migration adds the guard columns to `flow_steps` (follow the style of `db/migrations/0018_flow_steps_target_kind.sql`; `amountMinor` is a non-negative integer, paise; operator is one of the four).
- [ ] Postgres store and in-memory store round-trip guards on create/update/list flows; `flowStepFromRow` maps them back.
- [ ] `validateFlowSteps` in `src/server/admin/commands.ts` rejects: an operator outside the four, a non-positive (or non-integer) amount, and a guard on the terminal step (last position) - message states the terminal step cannot be guarded.
- [ ] `publishFlow` runs the guard validation through `validateFlowSteps` (already called) so unsafe configs cannot publish.
- [ ] Tests: admin command tests (validation rejections, round-trip through create/update flow) in `src/server/admin/commands.test.ts` style; postgres tests for guard persistence in `src/server/admin/postgres.test.ts` style; in-memory store tests where they exist.
- [ ] Tests written and passing for this slice (a slice is not done without them).

**Files to touch:** `src/server/admin/ports.ts` (FlowStepInput), `src/server/admin/commands.ts` (validateFlowSteps), `src/server/admin/postgres.ts` (flowStepFromRow, inserts/selects), `src/server/admin/in-memory.ts`, `db/migrations/00XX_amount_guard.sql` (new migration file), plus the matching test files.

**Verification:** `npm run lint`, `npm run build`, and the vitest suites for the files you touched. Do not run the app against a real DB unless the local PostgreSQL service is already running; the postgres test suite is the existing integration test path.
