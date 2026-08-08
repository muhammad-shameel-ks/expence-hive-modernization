# 05 - Server & Copy Cleanup for Review Findings

**What to build:** Remove the stale `payoutDetails`-era naming and copy that survived the bank-details removal, so the code and UI text reflect what the domain actually does now.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

^- [x] In `src/server/expenses/commands.ts`: rename `canSeePayoutDetails` to `canSeeClaimComments` and `maskPayoutDetails` to `maskClaimComments` (they now only mask `comments`; `payoutDetails` no longer exists). Update all call sites (around lines 38-43 and 473, 479, 489).
^- [x] In `src/server/expenses/commands.ts`: `requireTerminalPoolClaim` currently returns `{ actor, claim, index, step }` but neither caller (`verifyClaim`, `markPaid`) uses `index` - remove `index` from the returned object and the destructuring at both call sites.
^- [x] In `src/server/expenses/http.ts`: the comment block near `MULTIPART_ENVELOPE_ALLOWANCE_BYTES` and the `parseDraftForm` doc comment both say "eight text fields"; the form now has six text fields (title, category, subCategory, remark, amount, expenseDate) - update both comments.
^- [x] In `src/app/finance/payments/page.tsx` (around line 62): the copy "Claims at or past Finance verification, with the payout details needed to pay them." still promises payout details that were removed - reword to remove the payout-details claim.
^- [x] Update `src/server/expenses/commands.test.ts` if it references the renamed functions; ensure all backend vitest tests pass.
^- [x] Tests written and passing for this slice (a slice is not done without them).
