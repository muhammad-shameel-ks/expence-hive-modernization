# Payment Queue Export and Expense Summary PDF

Status: proposed implementation specification from the plan-maxxing session (2026-08-08).
Decisions 0008-0011 in `docs/architecture/decisions/` record the settled choices.

## Problem Statement

The Finance Head and higher-ups need to take the payment queue out of the app and work with it in Excel, and everyone needs a way to keep a local PDF copy of a claim's summary.

Today none of that exists: the "Download summary" button in the expense drawer is a dead label for paid claims, the queue page has no export at all, and rejected claims are invisible in the queue even though they are part of the payment record. The rejection reason that Finance enters when rejecting a claim never surfaces in any comment surface, so the "why" behind a rejection is hidden.

## Solution

Three linked capabilities:

1. **Rejected claims join the payment queue.** The queue becomes the full payment lifecycle record: awaiting payment, paid, and rejected. Rejected rows are frozen - no verify/pay action, no comment editor - and the rejection reason is rendered read-only in the Comments column from the claim's history (ADR-0008, ADR-0009).
2. **Excel export of the queue.** One "Export" button opens a popover with two actions: "Export current view" (respects search, filters, sort) and "Export full queue" (ignores them). The `.xlsx` is generated client-side with SheetJS from the claims the page already holds. A shared column schema module becomes the single source of truth for both the table's columns and the Excel columns, so future column changes flow into the export automatically (ADR-0010).
3. **PDF expense summary.** "Download summary" generates a PDF server-side with pdf-lib: expense facts, the approval journey timeline, comments, and the original receipt PDF attached as a file attachment. In the drawer it is the primary button for terminal states (paid, rejected) and a secondary outline button for every other status. The queue's side panel header gets the same button (ADR-0011).

## User Stories

### Excel export

1. As a Finance Head, I want to export the payment queue as an Excel workbook, so that I can work with the data outside the application.

2. As a Finance Head, I want one Export button that asks whether to export the current view or the full queue, so that I can choose the population I need without leaving the page.

3. As a Finance Head, I want the "Export current view" action to produce exactly what the table shows - search text, status/category/amount/date filters, and sort all applied - so that the file mirrors what I am looking at.

4. As a Finance Head, I want the "Export full queue" action to ignore all filters and search and contain every claim in the payment queue, so that I can get the complete record in one file.

5. As a Finance Head, I want the "Export current view" action disabled when the filtered view is empty, so that I cannot download an empty file by accident.

6. As a Finance Head, I want the exported file to be a real `.xlsx` workbook, so that formatting and analysis work natively in Excel.

7. As a Finance Head, I want the workbook to include every column the table shows plus the requester name and comments, so that the file is self-contained for analysis.

8. As a developer, I want the queue table and the Excel export to read from one shared column schema, so that future column changes appear in the export automatically.

9. As a Finance Head, I want the export to include rejected claims, so that the full payment record leaves the app, not just the actionable subset.

### Rejected claims in the queue

10. As a Finance Head, I want rejected claims to appear in the payment queue, so that the queue shows the full lifecycle record without digging into the activity feed.

11. As a Finance Head, I want a "Rejected" filter chip with a live count, so that I can isolate rejected claims from the working queue.

12. As a Finance Head, I want rejected rows to offer no verify/pay action, so that I cannot act on a frozen claim.

13. As a Finance Head, I want the comment editor hidden on rejected rows, so that I am never offered an edit the server rejects.

14. As a Finance Head, I want the rejection reason, actor, and date visible in the Comments column of rejected rows, so that I know why a claim was rejected and by whom.

15. As a Finance Head, I want the rejection reason to stay read-only, so that the frozen record cannot be rewritten.

### PDF expense summary

16. As an employee, I want to download a PDF summary of a claim from the drawer, so that I can keep a local copy for my records.

17. As a user, I want the summary PDF available for every claim status, so that I can keep a record at any point in the lifecycle.

18. As a user, I want the summary PDF to include the expense facts (title, category, subcategory, dates, amount, requester, status), so that the file is self-contained.

19. As a user, I want the summary PDF to include the approval journey timeline, so that the decision history with actors and dates is recorded.

20. As a user, I want the summary PDF to include the claim's comments, so that context and the rejection reason travel with the file.

21. As a user, I want the original receipt PDF attached to the summary PDF, so that the proof of expense is not lost when archiving.

22. As a user, I want the PDF download button in the drawer to be the primary action for paid and rejected claims and a secondary button for all other statuses, so that the in-progress workflow actions keep their place.

23. As a Finance user, I want a "Download summary" button in the queue's side panel header, so that I can grab the PDF while working the queue without switching views.

24. As a user, I want a loading state on the download button and a clear error message if the download fails, so that I know what is happening.

25. As a user, I want the summary PDF download to be authorized server-side per claim, so that I can only download summaries I am allowed to see.

## Implementation Decisions

- **Rejected claims enter the queue at the server:** `listFinancePaymentQueue` returns `in-finance | paid | rejected`.
- **Queue filter chips** gain "Rejected" with a live count; the payment-status mapping adds "Rejected".
- **Rejected rows** render without the terminal action button and without the comment editor; the Comments column renders the latest `rejected` history entry (reason, actor, timestamp) read-only, sourced from history - never written into the `comments` field.
- **Export chooser:** one Export button opening a popover with "Export current view" and "Export full queue"; the current-view action is disabled when the filtered row set is empty.
- **Shared column schema:** a schema module listing the queue's columns is the single source of truth for both the table renderer and the Excel export; starting columns are Name, Reference, Category, Sub category, Bill submission, Bill invoice date, Amount, Status, Payment status, Approved on, Remark, Comments.
- **Excel generation:** client-side SheetJS producing a real `.xlsx` from the claims already loaded in the page; the file includes every schema column regardless of the table's responsive column hiding.
- **PDF generation:** a server command plus route mirroring the receipt route's authorization pattern (org-scoped, claim visibility), building the PDF with pdf-lib and responding with `content-disposition: attachment` and `cache-control: private, no-store`.
- **PDF content:** facts, journey timeline, comments, and the original receipt PDF attached as a file attachment (pdf-lib cannot rasterize a PDF receipt into a visible page).
- **Drawer placement:** "Download summary" is the primary footer button for paid and rejected; a secondary outline button for draft, submitted, in-approval, approved, and in-finance.
- **Queue placement:** "Download summary" in the side panel header next to the close button, for any selected claim including ones without a receipt.

## Testing Decisions

- **What makes a good test here:** external behavior - what the user sees and downloads - not internals of the PDF or workbook bytes.
- **Queue domain:** extend `commands.test.ts` with `listFinancePaymentQueue` including rejected claims, and `http.test.ts` with the queue endpoint serving rejected claims to Finance only.
- **Rejected rendering:** extend `payment-queue-table.test.tsx` with the Rejected chip, count, hidden action/comment editor, and the read-only rejection entry in the Comments column.
- **Export wiring:** unit-test the shared column schema (schema-driven columns match the table's rendered headers) and the filter-application to the current-view export; assert the export action disabled state for an empty filtered view.
- **PDF route:** test that the summary route authorizes like the receipt route (claim visibility), returns `application/pdf` with attachment disposition, and that a draft claim still produces a PDF.
- **Prior art:** `expense-drawer.test.tsx`, `payment-queue-table.test.tsx`, and the `commands.test.ts`/`http.test.ts` pairs already cover the drawer, queue, and server commands; the run command is `npm test` (vitest).

## Out of Scope

- Editing or adding comments on rejected claims - the freeze stays (ADR-0009).
- Rasterizing the receipt into the PDF as visible pages - the receipt is attached as a file instead (ADR-0011).
- Fixing the unrelated dead "Full record" button in the drawer footer.
- Server-side Excel generation, CSV export, or multi-sheet workbooks.
- Pagination or virtualization of the queue.
- Making rejection revocable or resubmittable.
- Excel exports from any surface other than the queue page.

## Further Notes

- The SheetJS package on the npm registry is stale and carries known security advisories; the maintained build is distributed from the SheetJS CDN. If that is unacceptable, the fallback is server-side exceljs generation (which would require duplicating filter logic server-side).
- Receipts are PDF-only per ADR-0004; the attached receipt appears in the PDF reader's attachment panel, not as a visible page.
- The queue table already has 12 columns including Name and Remark; the shared schema starts from those exact columns.
- A draft claim produces a summary with facts but an empty journey; the generator renders whatever exists.
- Comment masking is preserved in the summary PDF: only the requester and Finance can see the Comments section (matching the app's `canSeeClaimComments` rule). Managers and approvers get facts, journey, and the rejection note but no comments section - the summary exposes no more than the app already does.
- The Excel export covers the full queue including rejected claims because rejected claims are part of the queue (ADR-0008).
