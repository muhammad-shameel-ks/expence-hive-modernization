# ADR-0014: Payment Queue Row Click Opens the Shared Expense Drawer, Receipt Panel Stays PDF-Only

Status: accepted.

## Context

`de45cd4` added the journey timeline (`JourneyFlow`) into the payment queue's left/inline receipt panel in `payment-queue-table.tsx`, alongside the existing `ReceiptPreview`.
This made the panel do two jobs at once - PDF viewing and journey review - and duplicated timeline rendering that already exists in the dashboard's `ExpenseDrawer` (right-side drawer, used via the generic `Drawer` component with `JourneyFlow` inside).
The two panels evolved independently: `ExpenseDrawer` already has takeover, verify/pay, and download-summary wired to the server; the queue's own panel does not.

## Decision

Split the two concerns back apart instead of building a new shared drawer abstraction:

1. Revert the queue's left/inline panel to its pre-`de45cd4` shape: `ReceiptPreview` (or the "no receipt attached" fallback) only, no `JourneyFlow`. The table still shrinks beside it when open.
2. Give that panel its own trigger (e.g. a receipt icon per row), independent of clicking the row itself.
3. Row click instead opens the existing `ExpenseDrawer` (right side), passing it the claim converted via `claimToExpense` plus `currentUserId`/`currentUserRoleId`/`currentUserRoleCode` - the same component and props the dashboard already uses. No new drawer component is built; reuse of `ExpenseDrawer` at a second call site is the de-duplication.
4. The two panels' open/close state stay independent - opening one does not require or close the other.

## Consequences

`ExpenseDrawer` becomes the single place that owns timeline rendering, takeover, verify/pay, and download-summary; a future capability added there (e.g. a new action) is automatically available from the payment queue too.
The queue's inline panel goes back to a narrow, single-purpose PDF viewer.
`PaymentQueueTable` needs to supply `ExpenseDrawer` with a `currentUser` display name, which it does not currently receive as a prop - the call site wiring needs to add that.

## Revisit When

If `ExpenseDrawer`'s dashboard-specific behavior (e.g. draft-continue, delete) ever needs to diverge meaningfully from what the payment queue should allow, the direct-reuse approach may need a variant or a prop to suppress dashboard-only actions.
