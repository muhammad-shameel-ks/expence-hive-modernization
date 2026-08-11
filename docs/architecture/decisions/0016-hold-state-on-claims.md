# ADR-0016: Hold State on Claims

Status: accepted.

## Context

The product needs the ability to pause a claim at any stage: a manager may hold a claim while gathering information, and a claim may be held because its assignee is unavailable (leave, departure).
No hold concept exists today; claims only move forward (approve, skip, reject) or to a terminal state.

## Decision

1. **Hold is a per-role privilege** (ADR-0015), not a universal right.
   A role with the hold toggle can hold a claim at any stage where it is the current actor.
2. **Placing a hold requires a reason**, recorded in history as a distinct `held` event with actor, reason, and timestamp.
   Resuming records a `resumed` event.
3. **A held claim keeps its status flow position** but is visibly marked `Held` everywhere it appears: the expense drawer, the journey timeline, dashboards, and the payment queue.
   It is not actionable by its current actor until resumed.
4. **Resume authority is positional:** the claim's current stage actor can resume.
   Delegation (ADR-0017) re-points the current actor, so the new actor can also resume.
5. **A hold is indefinite; there is no auto-expiry.**
   Held claims surface in a dedicated admin held-claims view so Superadmin retains oversight and can delegate or prompt resume (manual resume with admin oversight).
6. **Delegating a held claim does not clear the hold** (ADR-0017): the new actor inherits a still-held task and must resume it themselves.
7. The absence sweep (ADR-0018) never auto-skips a held claim: a hold is an explicit human decision and outranks the timeout.

## Consequences

The claim status model gains `held` alongside the flow statuses; the read model, drawer, timeline, and payment queue all render it.
History gains `held` and `resumed` event kinds, with the required reason attached.
The payment queue must keep held claims visible (badge) but frozen against terminal actions, mirroring the rejected-claim treatment (ADR-0008).

## Revisit When

If the company wants holds to expire or require periodic review, an auto-expiry rule is added on top of the indefinite default.
