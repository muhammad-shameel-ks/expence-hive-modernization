# ADR-0011: Server-Generated PDF Expense Summary

Status: accepted.

## Context

The expense drawer already labels the primary action "Download summary" for paid claims, but the button is dead (no `primaryAction` exists for paid claims).
Users want to keep a local PDF copy of a claim's summary: facts, approval journey, comments, and the receipt.
The drawer should offer it for every status, and Finance should reach it from the queue's side panel too.

## Decision

1. A server route (mirroring the receipt route's authorization pattern) generates the PDF with pdf-lib: expense facts, the approval journey timeline, comments, and the original receipt PDF attached as a file attachment.
2. The response is a `.pdf` with `content-disposition: attachment`, `cache-control: private, no-store`, behind the same org-scoped authorization as `getReceipt`.
3. The drawer footer: "Download summary" is the primary button for terminal states (paid, rejected) and a secondary outline button for every other status; in-progress actions stay primary.
4. The queue page's side panel header gets the same "Download summary" button.

## Consequences

One fetch yields one `.pdf`, authorized and generated server-side where the data and receipt bytes live.
The receipt is preserved faithfully as an attached file - pdf-lib cannot rasterize a PDF receipt into the summary as a visible image, so attachment is the native mechanism (users see it in the PDF reader's attachment panel).
A server-side dependency is added (pdf-lib).
Draft claims can produce a summary with facts but an empty journey - the generator renders whatever exists.

## Revisit When

If the receipt must appear as visible pages inside the summary, a rasterizer (e.g. sharp/libvips) must be introduced.
