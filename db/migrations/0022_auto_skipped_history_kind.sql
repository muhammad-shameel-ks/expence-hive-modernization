-- An amount-guard auto-skip is a policy decision, not a personal action:
-- it gets its own history kind so the journey timeline and skipped-stage
-- analytics can tell "the policy waived this stage" (auto-skipped) from
-- "a person waived it" (skipped). The event carries no actor - the policy
-- itself is the actor (ADR-0013).

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover', 'comment', 'auto-skipped'));
