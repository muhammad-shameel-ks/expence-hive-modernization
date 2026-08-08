# ADR-0009: Rejection Reason Surfaces Read-Only from History

Status: accepted.

## Context

`rejectClaim` stores the rejection reason only as a history event (`kind: "rejected"` with detail, actor, and timestamp).
The claim's `comments` field is separate and frozen after rejection - the server rejects comment updates on rejected claims.
The reason was therefore invisible in every comment surface, which hides the "why" behind a rejection.

## Decision

Keep the rejection reason out of the `comments` field and render it from the history event:

1. Rejected claims stay frozen for comment editing - no domain change to `updateComments`.
2. The comment section (the queue table's Comments column, and the expense summary PDF) renders the latest `rejected` history event as a read-only entry: reason, actor, and timestamp.
3. The reason is never copied into the claim's `comments` field, so user comments and the rejection reason never mix in one editable string.

## Consequences

No data duplication: the reason's source of truth remains the history event with full provenance.
Comment surfaces show the rejection as a distinct, immutable entry.
The existing freeze rule is preserved, so no new server behavior or migration is needed.

## Revisit When

If a rejected claim ever becomes editable again, or if multiple rejections become possible, the render-from-history approach needs a revisit.
