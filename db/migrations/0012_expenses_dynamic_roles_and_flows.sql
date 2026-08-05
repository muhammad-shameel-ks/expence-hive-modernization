-- Approval routing moves from a hard-coded 4-stage enum to arbitrary,
-- Flow-defined roles: current_stage/stage now hold a role id, not one of
-- ('manager','it','ceo','finance'). Steps also gain a 'skipped' status for
-- absence auto-skip and hierarchy-override takeovers, and history events
-- gain 'skipped'/'takeover' kinds. actor_id becomes nullable because
-- absence auto-skip is a system-generated event with no human actor.

ALTER TABLE reimbursement_claims DROP CONSTRAINT reimbursement_claims_current_stage_check;
ALTER TABLE reimbursement_claims ADD COLUMN current_stage_since TIMESTAMPTZ;

ALTER TABLE claim_approval_steps DROP CONSTRAINT claim_approval_steps_stage_check;
ALTER TABLE claim_approval_steps DROP CONSTRAINT claim_approval_steps_status_check;
ALTER TABLE claim_approval_steps ADD CONSTRAINT claim_approval_steps_status_check
  CHECK (status IN ('pending', 'approved', 'skipped', 'verified', 'paid'));
ALTER TABLE claim_approval_steps DROP CONSTRAINT claim_approval_steps_claim_id_stage_key;
ALTER TABLE claim_approval_steps ALTER COLUMN assigned_actor_id DROP NOT NULL;
ALTER TABLE claim_approval_steps RENAME COLUMN stage TO role_id;

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'correction', 'rejected', 'verified', 'paid', 'skipped', 'takeover'));
ALTER TABLE claim_history_events ALTER COLUMN actor_id DROP NOT NULL;
