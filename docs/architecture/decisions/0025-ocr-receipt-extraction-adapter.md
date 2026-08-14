# ADR-0025: OCR Receipt Extraction Adapter

Status: accepted.

## Context

Employees type expense facts by hand from their receipts, which is slow and error-prone.
The modernization spec lists automated OCR as a near-term enhancement rather than a first-release prerequisite.
Receipts may be PDFs (including the server-generated PDF expense summary) or camera images; camera capture is a promised first-class path.
The application's architecture requires every provider-dependent capability to work locally without Azure (blob and email already have local adapters).

## Decision

1. **OCR is a server-side provider adapter.**
   A document-extraction interface sits behind the command boundary, with a production adapter (Azure AI Document Intelligence is the leading candidate) and a local dev fallback (Tesseract or a deterministic stub), mirroring the blob and email adapters.
2. **First vertical slice: PDFs only.**
   The initial implementation extracts from PDF receipts only; camera images are deferred to a later slice.
3. **Extracted fields.**
   Amount, date, vendor, and a best-effort category suggestion are prefilled into the draft form.
   Every extracted value is presented as a suggestion the employee can accept or edit before submission; OCR output is never silently written into a claim.
   The category suggestion is explicitly marked as a guess, because category drives policy behavior and a wrong guess must not create a wrong approval.
4. **Failure behavior.**
   Unreadable or unrecognized receipts yield no suggestions and a clear message; the receipt-first flow always remains usable without OCR.

## Consequences

Draft completion gets faster for PDF receipts, at the cost of one new provider adapter and its dev parity story.
The research phase must compare providers on accuracy, cost, data privacy, and integration fit, then the adapter design must be validated against that research before the production adapter is configured.

## Revisit When

If camera-image extraction matures in the chosen provider, the slice can extend to images without changing the interface.
