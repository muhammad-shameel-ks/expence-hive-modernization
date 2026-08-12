-- Per-role privilege toggles (ADR-0015): role authority stops being a
-- hardcoded code-keyed map and becomes data on the role record. The six
-- toggles are the fixed privilege catalog - submit claims, approve/reject,
-- finance verify/pay (queue access), hold claims, view org-wide activity,
-- access the admin console. Delegation and company auto-skip configuration
-- are Superadmin-only built-ins and never appear as columns here.
--
-- The defaults encode the safe submit-only grant: a role inserted without
-- explicit capabilities (raw rows, pre-consoles) can submit and nothing
-- else. The backfill then matches today's behavior exactly:
-- intern/executive submit-only, manager +approve, finance-executive
-- +finance, finance-head +finance+org-activity, superadmin all six.

ALTER TABLE roles
  ADD COLUMN can_submit boolean NOT NULL DEFAULT true,
  ADD COLUMN can_approve boolean NOT NULL DEFAULT false,
  ADD COLUMN can_access_finance boolean NOT NULL DEFAULT false,
  ADD COLUMN can_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN can_view_org_activity boolean NOT NULL DEFAULT false,
  ADD COLUMN can_access_admin_console boolean NOT NULL DEFAULT false;

UPDATE roles SET can_approve = true WHERE code = 'manager';

UPDATE roles SET can_access_finance = true
  WHERE code IN ('finance-executive', 'finance-head');

UPDATE roles SET can_view_org_activity = true WHERE code = 'finance-head';

UPDATE roles SET
  can_submit = true,
  can_approve = true,
  can_access_finance = true,
  can_hold = true,
  can_view_org_activity = true,
  can_access_admin_console = true
WHERE code = 'superadmin';
