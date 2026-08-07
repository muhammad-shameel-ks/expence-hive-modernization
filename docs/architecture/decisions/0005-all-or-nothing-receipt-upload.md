# ADR-0005: All-or-Nothing Receipt Upload

Status: accepted.

## Context

There is no drafting system: the receipt-first flow creates a claim in a single shot when the employee finishes the form.
Issue #6 requires that receipt metadata and storage state stay consistent across retries and failures, and that a claim can never reference an unavailable object.

## Decision

Upload receipt bytes and create the claim in one multipart `POST /api/expenses` request at the "Review claim" step, all-or-nothing:

1. The server generates the claim and attachment IDs, then buffers the receipt (up to the configured cap) and uploads it to the final blob key.
2. Only after the bytes land does the server insert the claim and attachment rows in a single transaction, with attachment status `available`.
3. If the blob write fails, nothing is persisted and the request fails; the employee retries the same form.
4. If the database insert fails after the blob write succeeded, the server deletes the blob best-effort before failing the request.

There are no `pending`, `failed`, or `retryable` attachment states: the `status = 'available'` CHECK constraint on `claim_attachments` stays unchanged.
The client no longer supplies a storage key; the server derives it.

Downloads re-verify integrity: the server computes SHA-256 over the buffered upload and stores it with the attachment row (`content_sha256`, `size_bytes`, `uploaded_at` columns), then recomputes and compares the digest before serving a download, refusing to serve corrupted bytes.

## Consequences

An abandoned form never writes anything, so there are no orphaned blobs and no garbage collection job.
The "Review claim" step carries the upload, so a slow network makes that single click slower - acceptable because there is no drafting to interrupt.
A crash between blob write and row insert can leave a blob the compensating delete could not remove; such a blob is unreachable from any claim and can be swept later if it ever accumulates.
Retries are naturally idempotent: each retry uploads a fresh object keyed to fresh IDs.

## Revisit When

- A drafting or resumable-save feature is introduced; then the upload must move earlier in the flow and pending states return.
