-- Delegation (ADR-0017): the Superadmin re-points an in-flight claim's
-- current task to another specific person, recording a 'delegated' history
-- event (delegator, delegatee, reason) plus one 'skipped' event per
-- intermediate step auto-skipped when the delegatee's role sits later in
-- the claim's frozen steps. The 'takeover' kind stays in the constraint
-- because legacy rows may exist in dev databases; the code no longer
-- produces takeover events.

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover', 'comment', 'auto-skipped', 'held', 'resumed', 'delegated'));
