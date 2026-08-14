# ADR-0028: Optional Approval Comments

Status: accepted.

## Context

Rejections carry a required reason, recorded as a history event and rendered read-only in comment surfaces (ADR-0009).
Approvals record only actor and timestamp; an approver cannot explain why they approved, and the expense summary PDF and journey timeline show nothing about the decision.

## Decision

1. **Approval comments are optional free text.**
   The approve action gains an optional comment field; an approval without a comment is valid.
2. **Recording.**
   A provided comment is stored on the approval history event (kind `approved`) with actor and timestamp, exactly mirroring the rejection reason (ADR-0009).
3. **Rendering.**
   Approval comments render wherever rejection reasons render today: the journey timeline, the expense drawer, the activity feed, and the expense summary PDF.
4. **No separate comment entity.**
   The comment lives only on the history event and is never written into a claim-level comments field.

## Consequences

Approval decisions gain a lightweight explanation channel without mandatory friction.
The PDF summary and timeline gain one more event detail to render.

## Revisit When

If conditions arise that should force an approval comment (for example, approvals above a company amount threshold), the field becomes conditionally required on the approve action.
