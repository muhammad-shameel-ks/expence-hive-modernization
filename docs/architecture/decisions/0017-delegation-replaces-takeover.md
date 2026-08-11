# ADR-0017: Delegation Replaces Takeover

Status: accepted.

## Context

Takeover today has two shapes: **apex bypass** (Finance Head or Superadmin jumps every pending step and acts on the claim) and **positional bypass** (a role jumps ahead only when a later pending step targets that role), both recorded as a `takeover` history event.
The revamp restricts intervention to the administrator and changes its meaning: the administrator must not act on a claim at all, only re-route it when the assigned person is unavailable or the claim is stuck.
The motivating scenario is a manager who holds a claim (ADR-0016) and then becomes unavailable; the administrator re-points the task so the flow continues with someone else.

## Decision

1. **Takeover is removed completely:** both apex bypass and positional bypass are deleted from server commands, client mirrors, and history rendering.
   There is no take-over, only delegation.
2. **Delegation is Superadmin-only** and is not a toggleable privilege (ADR-0015).
3. **Any in-flight claim may be delegated:** submitted, in-approval, in-finance, or held (ADR-0016).
   Terminal claims (paid, rejected) and drafts are excluded.
4. **The target is any specific person.** Delegation changes the actor, not the flow:
   - A target whose role appears at the claim's current stage or nowhere in the claim's frozen steps **acts at the current stage** - the only change is the person.
   - A target whose role appears at a later step in the claim's flow **auto-skips the intermediate pending steps** and the claim lands at that step.
5. **The finance stage is delegatable too:** verify/pay can be re-pointed like any approval step.
6. **A required reason** is recorded with the delegation; the audit trail is a `delegated` history event (delegator, target, reason, timestamp) plus one `skipped` event per intermediate step auto-skipped, attributed to the administrator's authority.
7. **Holds survive delegation:** the new actor inherits the held state and resumes it themselves (ADR-0016).

## Consequences

`takeOverClaim`/`canTakeOver` and their tests are removed; the drawer's takeover action is replaced by a Superadmin-only delegate action with a person picker.
The journey timeline renders `delegated` and its accompanying `skipped` events.
The frozen-step model is extended: a delegated step's assigned actor changes post-submission while its position and role stay fixed.

## Revisit When

If non-admin managers ever need to hand off a claim (e.g. vacation), the catalog question reopens: delegation becomes a toggleable privilege (ADR-0015) rather than a Superadmin built-in.
