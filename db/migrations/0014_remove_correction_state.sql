-- Corrections/send-back are retired: an approval decision at any stage,
-- including Finance, is either an approval or an outright, terminal
-- rejection. 'needs-correction' never becomes a reachable claim status and
-- 'correction' never becomes a reachable history-event kind, so both are
-- dropped from their check constraints. claim_approval_steps gains
-- 'rejected' because a step can now record that decision directly.

ALTER TABLE reimbursement_claims DROP CONSTRAINT reimbursement_claims_status_check;
ALTER TABLE reimbursement_claims ADD CONSTRAINT reimbursement_claims_status_check
  CHECK (status IN ('draft', 'in-approval', 'rejected', 'in-finance', 'paid'));

ALTER TABLE claim_approval_steps DROP CONSTRAINT claim_approval_steps_status_check;
ALTER TABLE claim_approval_steps ADD CONSTRAINT claim_approval_steps_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'skipped', 'verified', 'paid'));

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover'));
