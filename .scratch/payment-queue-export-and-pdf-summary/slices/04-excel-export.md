# 04 - Excel export of the queue

**What to build:** The queue page gets an "Export" button in its toolbar that opens a popover with two actions: "Export current view" (search, filters, and sort applied) and "Export full queue" (every claim the page holds, ignoring filters). Both download a real `.xlsx` built client-side with SheetJS from the schema module from slice 02. "Export current view" is disabled when the filtered view is empty. Per ADR-0010.

**Blocked by:** 02 (shared column schema), 03 (table structure with the rejected chip).

**Status:** ready-for-agent

- [ ] Add the SheetJS dependency (`xlsx`) - the npm registry package is stale, so install from the maintained SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-<latest>/xlsx-<latest>.tgz`) and verify the version has no known advisories; keep `package-lock.json` in sync
- [ ] "Export" button in the queue toolbar opens a popover (existing app patterns: check `components/ui/` for popover/menu primitives; WCAG 2.2 AA - keyboard navigable, aria-expanded, focus managed) with "Export current view" and "Export full queue"
- [ ] "Export current view" exports the exact rows the table currently shows (post-search, post-filter, post-sort) as a real `.xlsx`
- [ ] "Export full queue" exports every claim prop the page passed in, ignoring filters/search
- [ ] The workbook's columns come from the shared schema module (slice 02) - all columns, including ones hidden responsively; amounts formatted for Excel (numeric, INR-friendly); dates as readable values; payment status per `paymentStatusFor`
- [ ] "Export current view" is disabled when the filtered view is empty
- [ ] Filename convention: descriptive, dated (e.g. `payment-queue-2026-08-08.xlsx`), distinguishing current-view vs full-queue exports
- [ ] Tests: export module unit tests (column mapping, amount/date formatting, filter application for current view), popover renders with both actions, disabled state on empty view; download behavior verified via a mocked `XLSX.writeFile` or equivalent seam
- [ ] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - new test file alongside `src/features/finance/payment-queue-table.test.tsx`; prior art for client-side file logic tests is thin, so keep the export logic in a separate module (e.g. `payment-queue-export.ts`) that is unit-testable without the DOM.
