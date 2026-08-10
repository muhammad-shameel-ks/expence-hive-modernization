# 02 - Submission-time guard evaluation + auto-skip

**What to build:** When an employee submits a claim, the server evaluates every guarded step against the claim total. Steps whose guard fails are materialized as skipped with a distinct `auto-skipped` history event (policy actor, reason text), and the flow advances to the next pending step. The terminal step is never auto-skipped. Flows without guards behave exactly as before.

**Blocked by:** 01 (guard shape on flow steps).

**Status:** ready-for-agent

- [ ] `ExpenseHistoryEvent["kind"]` union in `src/server/expenses/ports.ts` gains `"auto-skipped"`. `ACTIVITY_EVENT_KINDS` is unchanged (an auto-skip is not a personal action).
- [ ] In `submitClaim` (`src/server/expenses/commands.ts`, currently ~line 538), after steps materialize from the flow: evaluate each guarded step against the claim total (the claim's amount field - `amountMinor`; claim total is the single amount today). Failing steps are set to status `skipped` with an `auto-skipped` history event (no personal actor, detail like "Total ₹300 under ₹5000 guard on Finance Head step", submission timestamp). The first pending step becomes current (status/currentStage/currentActorId), matching how `catchUpAbsentStages` advances.
- [ ] The terminal step is never auto-skipped by a guard (existing terminal rule; validation in slice 01 already prevents publishing a guarded terminal step, but the runtime must also not skip it defensively).
- [ ] Evaluation is frozen in the claim's step snapshot: later flow edits cannot change it; resubmission after rejection re-evaluates against the guard (a fresh submission path).
- [ ] Under-threshold claims advance past the guarded step without an assigned actor; over-threshold claims route through it normally with an assigned actor.
- [ ] Tests in `src/server/expenses/commands.test.ts` style: under-threshold auto-skip with event + advance; over-threshold normal routing; exact boundary per operator (`gte` vs `gt`, `lte` vs `lt`); guard frozen on the snapshot; resubmission re-evaluates; no-guard flows unchanged (existing tests stay green); terminal never auto-skipped.
- [ ] Tests written and passing for this slice (a slice is not done without them).

**Files to touch:** `src/server/expenses/ports.ts` (history kind union), `src/server/expenses/commands.ts` (submitClaim), possibly `src/server/expenses/in-memory.ts` / `postgres.ts` if the store serializes kinds, plus `src/server/expenses/commands.test.ts`.

**Verification:** `npm run lint`, `npm run build`, and the vitest suites for the files you touched.
