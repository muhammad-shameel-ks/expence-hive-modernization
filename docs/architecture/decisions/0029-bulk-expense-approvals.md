# 0029 - Bulk Expense Approvals and Approvals Inbox

**Status:** accepted

## Context

Managers and Finance Heads often have multiple claims awaiting their review and decision.
Previously, approvers had to open each claim individually in the expense drawer and approve them one by one.
Approvers requested the ability to select multiple claims and mark them as approved in bulk, with an optional approval comment applied across the batch.

## Decision

1. **Dedicated Approvals Inbox:** A dedicated page at `/expenses/approvals` renders every claim in the organization currently awaiting the viewer's action at their approval stage.
   Access is gated on the `canApprove` or `canAccessFinance` privilege.
2. **Batch Multi-Selection:** Multi-select checkboxes in the table header and rows allow approvers to cherry-pick claims or select all filtered claims.
   Selection state is kept in memory as a Set of claim IDs that survives client-side search and category/date filtering.
3. **Confirmation Modal with Optional Comment:** Clicking "Approve selected" opens a confirmation dialog showing the count of selected claims, total formatted amount, a preview list of selected claims, and an optional approval comment textarea.
   Submitting sends a single POST request to `/api/expenses/bulk-approve` with the selected claim IDs and the optional comment.
4. **Server-Side Resilient Batch Execution:** The command layer validates each claim in the batch independently (verifying organization isolation, in-approval status, non-self-claim, and stage eligibility).
   Eligible claims are approved, stamped with individual `approved` history events containing the comment, and advanced to their next stage.
   Ineligible claims are skipped and reported in a `BulkApproveReport` with user-facing reasons, preventing a single stale or conflicting row from aborting the entire run.
5. **Drawer Integration:** Clicking any table row opens the standard `ExpenseDrawer` for full claim inspection, receipt preview, and individual actions.

## Consequences

- Managers and Finance Heads can approve multiple claims simultaneously in a frictionless workflow.
- Every claim maintains an exact, audited approval history event with timestamp, actor, and comment.
- Partial failures (e.g. concurrent approvals by another user) are clearly communicated in a warning summary while successful approvals proceed.
- The `Approvals` navigation link in `AppHeader` is activated for users with approval capabilities.
- Superseded: `AppHeader` was replaced by `AppSidebar` (grouped, role-gated nav); the same capability gate now activates the link there instead.
