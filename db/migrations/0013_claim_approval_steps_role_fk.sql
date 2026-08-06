-- claim_approval_steps.role_id (renamed from the old checked 'stage' enum
-- in 0012) had no referential integrity now that it holds an arbitrary
-- role id instead of one of 4 fixed strings.

ALTER TABLE claim_approval_steps ADD CONSTRAINT claim_approval_steps_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES roles(id);
