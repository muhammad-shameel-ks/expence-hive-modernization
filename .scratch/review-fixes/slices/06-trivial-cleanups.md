# 06 - Trivial cleanups (dead code, stale comment, double assertion)

**What to build:** A zero-behavior-change cleanup pass: remove dead code, fix a comment that contradicts its code, and remove a redundant assertion. Smallest possible diff.

**Blocked by:** 01 - Shared amount-guard module (touches `flow-section.tsx` and `commands.ts`, which S1 also edits). Also S5 touches flow-section.tsx - coordinate ownership.

**Status:** ready-for-agent

## Context

Three review findings:

1. **Dead code** in `src/features/admin/flow-section.tsx` (TWO spots, both the same shape):
   - ~line 225: `minorToRupees(rupeesToMinor(simulationAmount)) ?? simulationAmount` - `minorToRupees` returns `""` (not null) for null input, so the `??` never fires.
   - ~line 457: `minorToRupees(...) ?? simulationAmount` - same dead fallback.
   - Decide per site: if the value is guaranteed valid at that point, drop the `??`; if it can be empty/invalid, make the fallback explicit. Do not keep a fallback that cannot fire.

2. **Stale comment** in `src/features/dashboard/dashboard-stats.ts` (~line 13-14): the comment says "Pending/rejected stay list-scoped: they reflect claims awaiting attention." but line ~37 now applies `isMine` to `rejected` (this was an INTENTIONAL behavior change, per decision in planning - keep the code, fix the comment to describe the actual behavior: rejected is viewer-scoped via `isMine`, pending remains list-scoped).

3. **Double non-null assertion** in `src/server/expenses/commands.ts` (~line 2152): `employee.role!` where `employee.role` is presumably already narrowed or asserted above. Remove the redundant `!` if a guard above makes it unnecessary (verify the narrowing - if the type needs the assertion after an if-check that doesn't narrow, keep it; just remove the genuinely redundant one).

## Acceptance criteria

- [ ] Dead `?? simulationAmount` fallbacks removed in both spots (or made explicit if actually reachable - with evidence)
- [ ] dashboard-stats.ts comment matches the code (rejected is isMine-filtered; pending stays list-scoped)
- [ ] Redundant `employee.role!` removed (or kept with justification if needed for typing)
- [ ] No behavior change; existing tests pass; add/adjust a test only if a cleanup changes a function's contract (it should not)
- [ ] `npm run lint`, `npm run build`, full `npm test` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- This is the smallest slice: three small edits, one file each. Do not add features here.
- Test: `npx vitest run src/features/dashboard/dashboard-stats.test.ts src/server/expenses/commands.test.ts`
