# 04 - Queue side panel journey (story 16)

**What to build:** The Finance payment-queue side panel shows the same journey timeline as the drawer - including auto-skipped steps with their guard reason - so Finance makes payment decisions with the full route in view.

**Blocked by:** None - can start immediately. (If S1 lands while you work, prefer importing from the shared module; but do not block on it.)

**Status:** ready-for-agent

## Context

Spec story 16: "As Finance, I want auto-skipped steps to be visible in the journey of the drawer and queue side panel, so that payment decisions are made with the full route in view." Spec implementation decision: "the queue side panel and drawer share the same journey model."

Today: `src/features/finance/payment-queue-table.tsx` side panel (~line 493-554) renders ONLY the receipt preview (`ReceiptPreview`) or a "No receipt attached" placeholder - no journey timeline at all. The drawer (`src/features/dashboard/expense-drawer.tsx`) renders the journey via the exported pure function `getJourneyFlowItems(expense, currentUser, currentUserId)` (defined at expense-drawer.tsx:52, rendered at ~741, tested in `journey-meta.test.ts`).

## What to build

- In `payment-queue-table.tsx`, when a claim is selected, render the journey timeline in the side panel alongside (above or below) the receipt preview - sharing `getJourneyFlowItems` (the "same journey model" the spec demands; do NOT duplicate the journey logic).
- Investigate where the journey rendering component lives in the drawer (the `.map` over `getJourneyFlowItems` result at expense-drawer.tsx:741). If that render markup is embedded in `ExpenseDrawer`, extract it into a reusable component (e.g. `src/features/dashboard/journey-flow.tsx`) used by BOTH the drawer and the queue panel - the spec's "share the same journey model" makes this the right call. Keep the drawer's rendering byte-identical in appearance (don't change its styles).
- The panel has the claim data (check what fields `payment-queue-table.tsx` has in its selected claim row - it needs `history`, `steps`, `status`, `amount`, and the requester info `getJourneyFlowItems` reads; if the row shape differs from `Expense`, map it into the shape the journey function needs, or reuse the same read model used by the drawer).
- Auto-skipped steps must render distinctly with the guard reason (they already do via the drawer's journey function - verify it renders for queue-panel claims too).
- Accessible: panel is `aria-hidden`/`inert` when nothing is selected - keep that. The journey heading should have a label consistent with the panel's existing `aria-label`.

## Acceptance criteria

- [ ] Selecting a claim in the Finance queue shows the journey timeline (with auto-skipped steps + reasons) in the side panel, not just the receipt
- [ ] The drawer and queue panel share the same journey component/model - no duplicated journey markup
- [ ] Drawer appearance unchanged
- [ ] Tests: extend/add pure-function tests where journey logic moved (journey-meta.test.ts style - logic tests, not component render tests, matching repo convention of zero component-render tests)
- [ ] `npm run lint`, `npm run build`, full `npm test` pass

## Environment

- Worktree: /home/shameel/.herdr/worktrees/expence-hive-modernization/feat-conditions
- Test: `npx vitest run src/features/dashboard/journey-meta.test.ts src/features/finance/payment-queue-*.test.ts`
- Read `docs/specs/amount-guarded-workflow-steps.md` and `docs/ux/ux-research.md` before changing UI.
- Repo convention: zero component-render tests - all tests are pure-function tests. Keep it that way.
- The panel is responsive (fixed overlay on mobile, inline aside on lg+). Journey must fit both - check how the drawer handles small screens for guidance.
