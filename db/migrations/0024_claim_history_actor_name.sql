-- An amount-guard auto-skip event is attributed to the policy itself, not to
-- any person, so actor_id is null and actor_name is set to "Policy" (ADR-0013).
-- Storing actor_name on claim_history_events allows system or policy actors to
-- be persisted and reloaded without requiring a row in the employees table.

ALTER TABLE claim_history_events ADD COLUMN actor_name TEXT;
