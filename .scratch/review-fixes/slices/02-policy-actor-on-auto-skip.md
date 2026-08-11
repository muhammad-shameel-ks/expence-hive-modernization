# 02 - Policy actor on auto-skipped history event

**What to build:** The stored audit record for an amount-guard auto-skip carries `actorName: "Policy"` (no personal actorId), so the audit trail attributes the skip to the policy itself per ADR-0013 decision 1 - without it ever surfacing in any person's activity feed.

**Blocked by:** 01 - Shared amount-guard module (touches `src/server/expenses/commands.ts` which S1 also edits).

**Status:** ready-for-agent

## Context

Spec (amount-guarded-workflow-steps.md): "appends a history event of the new kind `auto-skipped` with no personal actor". ADR-0013: "the actor being the policy itself, not a person" and its consequences state "human waivers and policy skips are queryable separately" and "History visibility rules (requester, Finance, actors) apply to the new kind unchanged".

The review found: `applyAmountGuards` in `src/server/expenses/commands.ts` (~line 284-289) pushes the `auto-skipped` event with **no actor field at all** - only `{ id, kind, detail, createdAt }`. The journey timeline in the drawer paper-overs by filtering the event out of history and re-rendering from step data with a hardcoded `actor: "Policy"` string (`src/features/dashboard/expense-drawer.tsx:88`), so the raw record is unattributable.

## What to build

- In the server's history-event type (`src/server/expenses/ports.ts`, `ExpenseHistoryEvent`), add an `actorName?: string` field alongside the existing `actorId?: string`.
- In `applyAmountGuards` (commands.ts), write `actorName: "Policy"` on the auto-skipped event. Do NOT write an actorId - the policy is not an employee, and activity queries (`listActivityForActor` joins `actor_id`, and `ACTIVITY_EVENT_KINDS` excludes auto-skipped anyway) must never surface it.
- Check the persistence path (`src/server/expenses/postgres.ts` `insertHistory` ~line 342-350): it inserts only `actor_id`. The `claim_history_events` table has `actor_id` and the activity SELECT joins `employees actor ON actor.id = che.actor_id` (inner join!). Decide the minimal correct persistence:
  - If claim history is read back for the journey/PDF via a query that needs the name, add the migration column (e.g. `actor_name TEXT` on `claim_history_events`, migration `0024_claim_history_actor_name.sql`) and write it in `insertHistory`; if the inner join in `ACTIVITY_SELECT` would then exclude rows with NULL actor_id but non-null actor_name, confirm that's fine (auto-skipped is never in ACTIVITY_EVENT_KINDS).
  - If the client never reads the raw event from the server (drawer filters it and re-renders from steps), the type field alone may suffice - but the audit trail must be complete per ADR, so decide with evidence.
- Keep the drawer's steps-based rendering as-is (it's correct and intentional).
- Update `expense-drawer.tsx`'s hardcoded `actor: "Policy"` only if the server now provides the name and reading it is cleaner - otherwise leave it.

## Acceptance criteria

- [ ] Auto-skipped history events carry `actorName: "Policy"` and no actorId
- [ ] A regression test in `src/server/expenses/commands.test.ts` style asserts the submitted claim's `auto-skipped` history event has `actorName: "Policy"` and no actorId
- [ ] Persistence path writes the actor name (if the type carries it and history is persisted)
- [ ] Activity-feed queries unaffected (auto-skipped still never appears in personal feeds)
- [ ] `npm run lint`, `npm run build`, full `npm test` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- Test: `npx vitest run src/server/expenses/commands.test.ts src/server/expenses/postgres.test.ts`
- Migrations live in `db/migrations/`, numbered `0021_amount_guard.sql` (latest is `0023`). If a new migration is needed it's `0024_*.sql`, following the existing comment style explaining the domain rationale.
- AGENTS.md: business mutations server-side; no DB adapter assumed - the postgres store is the implementation.
