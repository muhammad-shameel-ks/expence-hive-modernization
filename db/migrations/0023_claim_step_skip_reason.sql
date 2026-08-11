-- A claim step auto-skipped by an amount guard (ADR-0012/0013) records the
-- frozen reason on the step snapshot, so the PDF summary and any step-based
-- surface can render "Auto-skipped" with the guard reason without re-deriving
-- it from history. Takeover and absence skips leave it null.

ALTER TABLE claim_approval_steps ADD COLUMN skip_reason TEXT;
