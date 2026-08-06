-- A Finance/HR comment is now recorded as a history event (kind 'comment')
-- so it shows up in an actor's personal activity feed alongside their
-- approve/reject/verify/pay/takeover decisions, not just as a mutable field
-- on the claim.

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover', 'comment'));
