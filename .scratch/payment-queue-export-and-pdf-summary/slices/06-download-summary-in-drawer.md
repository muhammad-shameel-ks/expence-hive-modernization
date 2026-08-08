# 06 - Download summary in the expense drawer

**What to build:** The expense drawer's "Download summary" becomes a real button for every status: the primary footer button for paid and rejected claims (replacing today's dead disabled label and the "No action available" label respectively), and a secondary outline button next to the primary action for draft, submitted, in-approval, approved, and in-finance claims. Clicking it fetches the PDF from the slice-05 route and downloads it as a file, with a loading state and a clear error message on failure. Per ADR-0011.

**Blocked by:** 05 (the summary route exists).

**Status:** ready-for-agent

- [x] The drawer footer renders "Download summary" as the primary button for `paid` and `rejected` statuses (remove the dead-label behavior in `PRIMARY_ACTION` at `src/features/dashboard/expense-drawer.tsx` and route the label through the real handler)
- [x] Every other status gets a secondary outline "Download summary" button alongside its existing primary action (draft keeps Continue draft/Delete draft)
- [x] The button triggers a download of the summary PDF for the active expense id (mirror how the drawer's other actions fetch `fetch(\`/api/expenses/${id}/...\`)`; the download should trigger a browser file save - see how the app handles downloads elsewhere or use a blob+anchor pattern)
- [x] Loading state on the button while the PDF is fetched; on failure an accessible error message appears near the button (reuse the drawer's existing `actionError` pattern) and no partial file is saved
- [x] `expense-drawer.test.tsx` covers: primary Download summary on paid and rejected claims (enabled, not disabled as today), secondary button on at least one in-progress status, the fetch fires with the right URL and produces a download, failure shows the error message
- [x] Existing tests pass (`npm test`), lint and build green

**Tests written and passing for this slice:** yes - extend `src/features/dashboard/expense-drawer.test.tsx`; the existing tests around verify/pay and rejection are the pattern for mocked fetch assertions.
