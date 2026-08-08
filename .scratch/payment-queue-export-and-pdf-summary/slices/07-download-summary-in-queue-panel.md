# 07 - Download summary in the queue panel header

**What to build:** The queue page's side panel header (today: the receipt preview panel with a close button) gains a "Download summary" button that downloads the slice-05 PDF for the selected claim - including claims without a receipt, where the panel shows the "No receipt attached" state. Per ADR-0011.

**Blocked by:** 04 (file-order on `payment-queue-table.tsx`), 05 (the summary route exists).

**Status:** ready-for-agent

- [x] "Download summary" button in the side panel header (next to the close button) for the selected claim, visible in both panel states (receipt preview and no-receipt state)
- [x] Clicking downloads the summary PDF for the selected claim id with a loading state and an accessible error message on failure (reuse the table's existing `actionError` banner pattern)
- [x] `payment-queue-table.test.tsx` covers: the button appears in the panel header for a selected claim with a receipt and without one, the fetch fires with the correct URL, failure shows the error banner
- [x] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - extend `src/features/finance/payment-queue-table.test.tsx`; the panel open/close tests there are the pattern.
