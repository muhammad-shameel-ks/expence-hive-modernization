# ADR-0013: Distinct Auto-Skip History Event

Status: accepted.

## Context

A higher-stage takeover already records skipped earlier stages as `Skipped` history events with a human actor.
Amount guards (ADR-0012) introduce a second reason a stage never happens: policy decided it, not a person.
If both wrote the same event kind, the journey timeline could not distinguish "the Finance Head waived this stage" from "the Finance Head never needed to see it", and HR analytics for skipped-stage volume would mix takeover skips with policy skips.

## Decision

1. An amount-guard skip is recorded as a **distinct history event kind** (`auto-skipped`) with the actor being the policy itself, not a person.
2. The event records the guard reason, e.g. "total ₹300 under ₹5000", so the audit trail explains the skip without parsing.
3. The journey timeline renders the two kinds differently, and HR skipped-stage analytics can separate them.
4. Guard evaluation happens once, at submission, server-side, alongside the frozen workflow version.

## Consequences

The audit trail stays unambiguous: human waivers and policy skips are queryable separately.
The timeline and PDF summary gain a new event shape to render.
History visibility rules (requester, Finance, actors) apply to the new kind unchanged.

## Revisit When

If other automatic outcomes need history representation (e.g. system expiration, auto-approval), they follow the same pattern: a distinct kind with a policy actor and a recorded reason.
