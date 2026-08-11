-- Hold state (ADR-0016): a claim can be paused at any stage by its current
-- actor when their role has the hold privilege, with a required reason.
-- Held claims keep their flow position (the status/current_* columns are
-- untouched) and are frozen against terminal actions until the current
-- stage actor resumes them. The held_at/held_by/held_reason columns are
-- nullable: a claim is held exactly when held_at is set.

ALTER TABLE reimbursement_claims
  ADD COLUMN held_at TIMESTAMPTZ,
  ADD COLUMN held_by TEXT REFERENCES employees(id),
  ADD COLUMN held_reason TEXT;

-- Holding and resuming are distinct history events: 'held' carries the
-- required reason in detail, 'resumed' records who unpaused the claim.

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover', 'comment', 'auto-skipped', 'held', 'resumed'));
