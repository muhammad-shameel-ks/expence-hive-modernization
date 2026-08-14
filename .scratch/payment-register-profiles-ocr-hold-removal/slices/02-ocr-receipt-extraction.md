# 02 - OCR research and PDF receipt extraction slice

**What to build:** Research document comparing OCR options, plus a working vertical slice: after an employee picks a PDF receipt in the receipt-first flow, the app extracts suggested amount, date, vendor, and a best-effort category guess into the draft form. Every extracted value is an editable suggestion the employee confirms before submission - nothing is written to the claim silently. Unreadable PDFs produce no suggestions and a clear message.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

References: ADR-0025 (docs/architecture/decisions/0025-ocr-receipt-extraction-adapter.md), spec docs/specs/payment-register-profiles-ocr-hold-removal.md (work item 5, stories 35-39), CONTEXT.md (OCR extraction).

## Research deliverable

- Write `docs/research/ocr-receipt-extraction.md`: compare candidate providers (Azure AI Document Intelligence - the leading candidate given the Azure-native stack, Tesseract, and any other credible option) on accuracy for receipt fields, cost, data privacy, and integration fit with the server-side command boundary. End with a recommendation and what the chosen production adapter needs.
- Keep it proportionate - a focused decision record, not a thesis. Use web research if needed.

## Vertical slice

- A new server-side OCR/extraction port (e.g. in `src/server/expenses/ports.ts` or a new `src/server/receipts` area): given receipt bytes (PDF), return `{ amount?, date?, vendor?, categoryGuess? }` suggestions with confidence.
- Provider adapter split mirroring the existing blob/email adapters:
  - A local fallback adapter that works without Azure. Preference: use the already-installed `pdfjs-dist` to extract the PDF text layer and apply deterministic heuristics (currency/amount pattern, date patterns, vendor line heuristics) - zero new production dependencies and deterministic for tests. A Tesseract-based option is acceptable if it fits cleanly.
  - A production adapter for Azure AI Document Intelligence behind the same interface, selected by configuration and never required for local dev or tests.
- A protected API route that accepts a receipt PDF upload (multipart or binary) and returns the suggestions JSON. The route must authorize the actor and reject non-PDF content. Client-side file size/type validation already exists in `src/features/expenses/receipt-file-validation.ts` - respect it.
- UI: in the receipt-first flow (`src/features/expenses/expense-create-form.tsx`, `src/features/receipts/receipt-preview.tsx`), after a PDF receipt is picked, show the suggestions as editable fields: amount, date, vendor, and a category guess explicitly labeled as a guess (e.g. "Suggested category - please confirm"). The employee accepts/edits each field; accepted values populate the draft fields. An explicit dismiss path ("no suggestions") must exist, and the flow must remain fully usable when OCR yields nothing. Keyboard accessible (WCAG 2.2 AA).
- Failure behavior: unreadable PDF, extraction error, or network error -> no suggestions, clear message, no blocked flow.

## Acceptance criteria

- [ ] The research document exists and ends with a provider recommendation.
- [ ] A PDF receipt upload returns amount/date/vendor/categoryGuess suggestions through the API for a fixture PDF.
- [ ] The draft form shows the suggestions as editable, confirmable fields; nothing is written to the claim without the employee's confirmation.
- [ ] An unreadable receipt yields no suggestions and a clear message.
- [ ] The production Azure adapter exists behind the same interface, and local dev/tests never need Azure.
- [ ] Tests written and passing for this slice (a slice is not done without them).

## Testing

- Contract tests for the extraction port against the local fallback with a fixture PDF (create a minimal PDF fixture in test files; `pdf-lib` is already a dependency and can generate one).
- Route tests for the upload API (authorization, non-PDF rejection, success shape).
- Component tests for the suggestions UI (suggestions shown, editable, confirm writes to draft, dismiss path, empty-state message).
- Run `npx vitest run` (full suite), `npm run lint`, `npm run build` - all green.
- Repo conventions: server-side mutation boundary, no em dash characters, follow existing test patterns.
