-- A flow step may carry an optional amount guard: the step runs only when
-- the claim total satisfies the operator against guard_amount_minor (a
-- positive integer in paise). The operator is one of 'gte', 'gt', 'lte',
-- 'lt', read as "this step runs only when the claim total satisfies the
-- operator". A NULL pair means the step is unguarded; a guard is always
-- both-or-neither. The terminal step must never be guarded - validation
-- rejects that before publish because the runtime never auto-skips the
-- payment completion stage.

ALTER TABLE flow_steps ADD COLUMN guard_operator TEXT;
ALTER TABLE flow_steps ADD COLUMN guard_amount_minor BIGINT;
ALTER TABLE flow_steps ADD CONSTRAINT flow_steps_guard_check
  CHECK (
    (guard_operator IS NULL AND guard_amount_minor IS NULL) OR
    (guard_operator IN ('gte', 'gt', 'lte', 'lt') AND guard_amount_minor > 0)
  );
