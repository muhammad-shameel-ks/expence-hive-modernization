-- Flow steps support two target kinds: 'role' (any locked or custom role,
-- resolved org-wide, or same-department for Manager steps) and 'team-lead'
-- (the requester's assigned named person from
-- hierarchy_assignments.manager_id, whose own role is irrelevant). A
-- team-lead step carries no role_id; a role step always does. Existing
-- rows default to the role kind so published flows stay valid.

ALTER TABLE flow_steps ADD COLUMN kind TEXT NOT NULL DEFAULT 'role';
ALTER TABLE flow_steps ALTER COLUMN role_id DROP NOT NULL;
ALTER TABLE flow_steps ADD CONSTRAINT flow_steps_kind_check
  CHECK ((kind = 'role' AND role_id IS NOT NULL) OR (kind = 'team-lead' AND role_id IS NULL));

-- A claim approval step that resolved a team-lead flow step has a NULL
-- role_id: it always carries the assigned actor id instead (the named
-- person, not a role, governs that stage).
ALTER TABLE claim_approval_steps ALTER COLUMN role_id DROP NOT NULL;
