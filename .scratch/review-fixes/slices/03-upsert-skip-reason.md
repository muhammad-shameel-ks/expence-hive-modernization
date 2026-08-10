# 03 - Fix upsert dropping skip_reason

**What to build:** Re-saving a claim (conflict path) no longer silently drops a step's `skip_reason` - the reason set by an amount-guard auto-skip survives an update.

**Blocked by:** 01 - Shared amount-guard module (same file `src/server/expenses/postgres.ts`; also S2 touches `insertHistory` in the same file, so coordinate - the file changes must merge cleanly).

**Status:** ready-for-agent

## Context

`src/server/expenses/postgres.ts` (~line 183-190): the step upsert is

```
INSERT INTO claim_approval_steps (id, claim_id, position, role_id, assigned_actor_id, status, decided_at, skip_reason)
VALUES (...)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at, assigned_actor_id = EXCLUDED.assigned_actor_id
```

The `DO UPDATE SET` omits `skip_reason`. Benign today (nothing mutates a step after auto-skip), but a conflict re-save would silently lose a changed reason - exactly the "auto-skipped" reason the PDF summary and step-based surfaces render.

## What to build

- Add `skip_reason = EXCLUDED.skip_reason` to the `DO UPDATE SET` clause.
- Regression test in `src/server/expenses/postgres.test.ts` style: updating a claim whose step already exists with a `skip_reason` preserves the reason (simulate by inserting via one updateClaim call and updating with the same step id but a changed reason - or whatever the test store's semantics allow; the test must fail without the fix).
- No migration needed (column exists from `0023_claim_step_skip_reason.sql`).

## Acceptance criteria

- [ ] `skip_reason` included in `DO UPDATE SET`
- [ ] Regression test that fails without the fix, passes with it
- [ ] `npm run lint`, `npm run build`, full `npm test` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- Test: `npx vitest run src/server/expenses/postgres.test.ts`
- This is a tiny slice: a one-line SQL change plus a test. Do not bundle other edits.
