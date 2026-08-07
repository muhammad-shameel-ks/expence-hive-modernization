# 04 - Finance Reviewer Drawer UX Workflow - In-Drawer Post-Verification Prompt

**What to build:**
Update the post-verification behavior in `src/features/dashboard/expense-drawer.tsx` and `src/features/finance/payment-queue-table.tsx`. When a Finance Reviewer clicks "Verify for payment", do not close the drawer or trigger a full page reload. Instead, update the claim state live in the drawer to `verified` and show an immediate in-drawer prompt asking: `"Mark payment as completed now?"` with `"Yes, Mark Paid"` and `"Keep Verified"` buttons. Clicking `"Yes, Mark Paid"` issues `POST /api/expenses/:id/pay` and completes payout within the same drawer pass.

**Blocked by:** 02 - Finance Verification Pool Authorization Fix, 03 - UI Refactor - Remove Bank Details & Update Forms & Payment Queue Table

**Status:** ready-for-agent

- [ ] In `src/features/dashboard/expense-drawer.tsx`, handle `verify` action without full page reload: update internal claim state live to `verified` and display confirmation prompt (`"Mark payment as completed now?"`).
- [ ] Provide two distinct actions in the prompt: `"Yes, Mark Paid"` (triggers `POST /api/expenses/:id/pay` and marks paid) and `"Keep Verified"` (keeps claim verified and closes prompt / refreshes background).
- [ ] Update `payment-queue-table.tsx` or drawer integration if applicable for seamless side-panel state sync.
- [ ] Write unit / integration tests in `expense-drawer.test.tsx` or `payment-queue-table.test.tsx` testing the verify-to-pay drawer workflow.
- [ ] Tests written and passing for this slice.
