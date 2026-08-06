# ADR-0004: Blob Storage for Receipts via Provider Adapter

Status: accepted.

## Context

Expense claims persist receipt metadata only; the bytes never leave the browser.
Issue #6 requires a protected upload path, org- and claim-scoped private object keys, server-side validation, integrity information, short-lived authorized access, and local Azurite coverage.
The production target is private Azure Blob Storage; the local target is Azurite (ADR-0001).
No storage dependency exists yet.

## Decision

Add `@azure/storage-blob` and define a `BlobStore` port with `putBlob`, `getBlob`, and `deleteBlob` operations over in-memory `Uint8Array` buffers.
Buffering instead of streaming is justified by the size cap: the server accepts at most 10 MB, so the memory cost of a whole-buffer upload is bounded.

Provide one parameterized adapter class (`AzureBlobStore`) that takes a connection string in its constructor and implements the port: it lazily creates the `receipts` container, returns null for a missing blob, and tolerates deleting a missing blob.
This mirrors the existing provider-adapter pattern used for email (Mailpit locally, Microsoft Graph in production).

Compose the adapter at a single seam: `BLOB_STORAGE_CONNECTION_STRING` selects the Azure adapter, local development without it falls back to an Azurite factory that passes the `UseDevelopmentStorage=true` connection string, and production without it fails loudly at startup.

Use a single private container named `receipts`.

Scope every object key as `{organizationId}/{claimId}/{attachmentId}.{ext}`, with the extension derived from the server-detected content type rather than the client file name.
Organization and claim isolation therefore lives in both the key prefix and the application authorization boundary.

Accept `image/*` and `application/pdf` only, enforce a size cap that defaults to 10 MB and is configurable via `MAX_RECEIPT_SIZE_BYTES`, and verify the declared content type against magic bytes server-side (for example `%PDF-`, JPEG `FFD8FF`, PNG `89504E47`) instead of trusting the browser.

Authorized downloads use a server proxy: `GET /api/expenses/[id]/receipt` runs the same claim-view authorization as every other expense read (requester, current actor, previous actors, and Finance), then serves the buffered blob bytes through the response.
Short-lived SAS URLs were rejected for the MVP: they add adapter-specific ticket logic, behave differently under Azurite, and the proxy keeps authorization in one place.

## Consequences

The browser never holds storage credentials; all bytes cross the server boundary and receive an authorization check.
No public URLs are ever generated, matching the spec.
Receipt downloads pass through the app server, which is acceptable at MVP scale and worth revisiting if throughput becomes a concern.
A new npm dependency (`@azure/storage-blob`) is required.
The integration seam means the same application code runs against Azurite locally and Azure in production.

## Revisit When

- Download volume grows enough that proxying every byte through the app server is a bottleneck; then evaluate SAS tokens or Azure Front Door.
