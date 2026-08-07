# ADR-0006: Dual-Source ReceiptPreview (Server Fetch | Local File)

Status: accepted.

## Context

The expense creation wizard picks a PDF at the Receipt step but only uploads its bytes when the draft is saved (`saveDraft` at the Details step and Review submit), per ADR-0005's all-or-nothing upload and the no-replacement rule for stored receipts. `ReceiptPreview` currently fetches bytes exclusively from `GET /api/expenses/[claimId]/receipt`, so a freshly picked, not-yet-saved `File` cannot be previewed: there is no claimId and nothing on the server to fetch.

The wizard needs an in-flow preview that works for both a locally picked file (pre-save) and a stored receipt (resumed draft), without moving the upload earlier and without re-implementing PDF rendering.

## Decision

Extend `ReceiptPreview` to accept two mutually exclusive sources:

1. `claimId` (existing behavior): fetch via the authorized server proxy, SHA-256 re-verified on download.
2. A local `File`: read `arrayBuffer()` and feed the bytes into the same lazy `pdfjs-dist` document pipeline (`getDocument({ data })`), including the existing size-cap gate, page render loop, worker setup, and fit-on-open.

Upload timing, server validation, and storage semantics are untouched. The render pipeline, zoom/pan/keyboard behavior, and test coverage for the fetch path stay shared; new tests cover the local-file path with mocked `pdfjs-dist`.

## Consequences

The wizard can preview receipts before any server round-trip; resumed drafts keep the authorized proxy path. The component's props surface grows to `claimId | file`, so all three consumers (creation wizard, dashboard drawer, payment queue) share one viewer. Bytes never leave the client until the user saves, preserving ADR-0005. Memory: a 25 MB cap PDF is fully rendered to canvas, which is heavier in the embedded sidebar than in the drawer - accepted for now (see ADR-0007 for the mobile mitigation).

## Revisit When

A true draft-save-per-step or early-upload flow is introduced; then the local-file path may be removable in favor of a single server path.
