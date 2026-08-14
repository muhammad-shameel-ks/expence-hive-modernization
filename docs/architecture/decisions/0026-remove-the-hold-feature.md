# ADR-0026: Remove the Hold Feature

Status: accepted.

## Context

ADR-0016 introduced a hold state that lets a claim be paused at any stage with a reason, resumed by its current actor, and overseen by Superadmin.
Product direction changed: corrections are no longer a pause-and-fix cycle.
The only correction path is an outright rejection followed by a new claim, matching the rejection semantics already in the model (a rejected claim is terminal and never reopened).
Holding therefore becomes a second, conflicting correction mechanism, and it is removed entirely.

## Decision

1. **Hold is removed everywhere.**
   The held claim status, hold and resume actions, the required hold reason, `held` and `resumed` history events, the Held badge, the held-claims admin oversight view, and the absence-sweep hold exemption are all removed.
2. **Privilege catalog.**
   The hold toggle is removed from the per-role privilege catalog (ADR-0015); the catalog gains the `approve bank detail changes` toggle in the same change (ADR-0024), keeping six toggles.
3. **Delegation.**
   The ADR-0017 clause that delegating a held claim does not clear the hold is retired; delegation re-points the current actor with no hold interaction.
4. **Absence auto-skip.**
   The ADR-0018 sweep applies to every pending claim; there is no held exemption.
   An idle assignee's claim auto-skips after the configured timeout, and delegation remains the explicit rescue when an assignee is unavailable.
5. **Dashboard.**
   The approver dashboard's "my holds" card (ADR-0020) is replaced by role-adaptive layout tuning (ADR-0027).
6. **Migration.**
   Persisted held claims are auto-resumed by a migration: they become actionable again at their stage, with an audit note recording the auto-resume.

## Consequences

The correction story is single and unambiguous: reject and create a new claim.
ADRs 0015, 0016, 0017, 0018, and 0020 are amended by this decision, and ADR-0016 is superseded.
Approvers lose the ability to pause a claim while gathering information; the trade-off is a simpler status model and one correction path.

## Revisit When

If a genuine need for pausing (not correcting) claims returns, a hold can be reintroduced as a distinct feature with its own privilege toggle.
