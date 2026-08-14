-- Remove the hold feature (ADR-0026): the held claim status, hold and
-- resume actions, held/resumed history events, and the held-claims admin
-- oversight view are all removed. Persisted held claims are auto-resumed:
-- each one gets an audit note in its history BEFORE the hold columns are
-- dropped, so the claim becomes actionable again at its stage with a
-- recorded reason for the change.

-- Append an audit note per previously-held claim. The event uses the
-- 'comment' kind, which the remaining history schema and the activity feed
-- already understand; the detail records the auto-resume so the timeline
-- explains why the claim is no longer paused.

INSERT INTO claim_history_events (id, claim_id, kind, actor_id, actor_name, detail, created_at)
SELECT
  'history-hold-removal-' || rc.id,
  rc.id,
  'comment',
  NULL,
  'System',
  'Hold feature removed; claim auto-resumed',
  COALESCE(rc.held_at, rc.updated_at, now())
FROM reimbursement_claims rc
WHERE rc.held_at IS NOT NULL;

-- Held and resumed are no longer valid history kinds; 'takeover' stays in
-- the constraint because legacy rows may exist in dev databases (0029).
-- The held/resumed event rows themselves are deleted here: the feature is
-- removed, the audit note above already explains the auto-resume, and the
-- tightened constraint would otherwise reject the legacy rows.

DELETE FROM claim_history_events WHERE kind IN ('held', 'resumed');

ALTER TABLE claim_history_events DROP CONSTRAINT claim_history_events_kind_check;
ALTER TABLE claim_history_events ADD CONSTRAINT claim_history_events_kind_check
  CHECK (kind IN ('draft', 'submitted', 'approved', 'rejected', 'verified', 'paid', 'skipped', 'takeover', 'comment', 'auto-skipped', 'delegated'));

-- The hold state columns go away last: the audit note above already read
-- them, so no information is lost with the drop.

ALTER TABLE reimbursement_claims
  DROP COLUMN held_at,
  DROP COLUMN held_by,
  DROP COLUMN held_reason;
