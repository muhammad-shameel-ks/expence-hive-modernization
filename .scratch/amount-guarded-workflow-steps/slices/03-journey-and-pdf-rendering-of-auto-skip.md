# 03 - Journey + PDF rendering of auto-skip

**What to build:** The claim journey timeline (drawer + queue side panel) and the PDF expense summary render `auto-skipped` history events distinctly from takeover `skipped` events, with the guard reason visible. Skipped-stage metrics stay separable by kind where any exist.

**Blocked by:** 02 (`auto-skipped` kind exists on real claims).

**Status:** ready-for-agent

- [ ] `src/features/dashboard/journey-meta.ts` gains an `auto-skipped` entry with a distinct label (e.g. "Auto-skipped" - do not reuse "Stage skipped"), its own badge/icon/border tone, and a `FILTER_DOT_COLOR` entry. The label renders next to the event detail (the guard reason).
- [ ] Any kind-union/read-model surfaces that enumerate history kinds (`src/features/dashboard/expense-read-model.ts`, `mock-data.ts` if it types kinds) accept the new kind.
- [ ] `src/server/expenses/summary-pdf.ts` renders the `auto-skipped` kind in the journey timeline with its detail (currently ~line 69 maps `skipped: "Skipped"` - add the new kind, distinct label, keep the detail text).
- [ ] Check whether any analytics/stat module counts skipped events (`src/features/dashboard/dashboard-stats.ts`, `dashboard-attention.ts`, payment-queue-query): `skipped` and `auto-skipped` must be counted separately if a count exists; if no such metric exists, no change needed - just verify.
- [ ] Tests: `src/features/dashboard/journey-meta.test.ts` gains `auto-skipped` cases; `src/server/expenses/summary-pdf.test.ts` asserts the auto-skip event appears in the journey with label + reason.
- [ ] Tests written and passing for this slice (a slice is not done without them).

**Files to touch:** `src/features/dashboard/journey-meta.ts`, `src/server/expenses/summary-pdf.ts`, possibly `src/features/dashboard/expense-read-model.ts` / `mock-data.ts`, plus the matching test files.

**Verification:** `npm run lint`, `npm run build`, and the vitest suites for the files you touched.
