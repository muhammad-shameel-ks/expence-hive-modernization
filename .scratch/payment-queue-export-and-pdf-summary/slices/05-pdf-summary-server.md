# 05 - PDF summary server

**What to build:** A server route that returns a `.pdf` summary of a single claim: expense facts, the approval journey timeline with actor names and dates, comments (including the read-only rejection reason when rejected), with the original receipt PDF attached as a file attachment. Built with pdf-lib. Authorization mirrors the receipt route: org-scoped, claim visibility. Per ADR-0011.

**Blocked by:** 01 (shares `src/server/expenses/http.ts`).

**Status:** ready-for-agent

- [x] Add the `pdf-lib` dependency (`npm install pdf-lib`), keep `package-lock.json` in sync
- [x] A PDF builder module (e.g. `src/server/expenses/summary-pdf.ts`) takes the claim, the employees (for actor names), and the receipt bytes and produces the PDF: facts block (title, category, subcategory, dates, amount, requester, status), journey timeline (each step: role, actor, decision, date), comments block, and the receipt attached as a file attachment (pdf-lib `embedAttachment`) - only when a receipt exists; renders gracefully when fields or the journey are empty (e.g. drafts)
- [x] The route (e.g. `src/app/api/expenses/[id]/summary/route.ts`) reuses existing commands for authorization (`getClaim`, `getReceipt`, `listEmployees` - check what `handleGetExpenseRequest` and `handleGetReceiptRequest` in `src/server/expenses/http.ts` do and mirror them), builds the PDF server-side, and responds with `application/pdf`, `content-disposition: attachment; filename="<ref>-summary.pdf"`, `cache-control: private, no-store`
- [x] Errors map through the existing `expenseErrorResponse` path (404 for unknown/unauthorized claims, 401 handling per the existing session pattern in other routes - copy the route.ts convention from `src/app/api/expenses/[id]/receipt/route.ts`)
- [x] Tests: `http.test.ts` covers the summary endpoint - Finance/requester/assigned-approver succeed, out-of-org or unauthorized actor gets an error; the returned bytes start with `%PDF-`; content-disposition is attachment; a claim without a receipt still yields a valid PDF; `summary-pdf.test.ts` (or similar) asserts the builder embeds the receipt attachment when present
- [x] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - extend `src/server/expenses/http.test.ts` and add a builder unit test; receipt fixture patterns already exist in `http.test.ts` (e.g. around the receipt endpoint tests).
