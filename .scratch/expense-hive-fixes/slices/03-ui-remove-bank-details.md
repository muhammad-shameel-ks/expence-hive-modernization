# 03 - UI Refactor - Remove Bank Details & Update Forms & Payment Queue Table

**What to build:**
Remove Account Number and IFSC Code fields from the expense creation form (`src/features/expenses/expense-create-form.tsx`) and table headers/cells from the payment queue table (`src/features/finance/payment-queue-table.tsx`). Update UI test files and queries.

**Blocked by:** 01 - Core Domain & DB Schema Cleanup - Remove Bank Details / PayoutDetails

**Status:** ready-for-agent

- [ ] Remove `accountNumber` and `ifscCode` state, inputs, and payload formatting from `src/features/expenses/expense-create-form.tsx`.
- [ ] Remove `Account number` and `IFSC code` table headers and cell rendering from `src/features/finance/payment-queue-table.tsx`.
- [ ] Remove `payoutDetails` mock data from `src/features/finance/payment-queue-query.test.ts`, `payment-queue-selection.test.ts`, `payment-queue-table.test.tsx`, `expense-draft.test.ts`, `expense-query.test.ts`.
- [ ] Ensure all UI tests pass.
- [ ] Tests written and passing for this slice.
