-- Profiles page and bank details (ADR-0024): personal fields on employees
-- plus the bank-detail change request concept. A bank-details change enters
-- a pending state and takes effect only after a role carrying the new
-- `approve bank detail changes` privilege approves it; nobody approves
-- their own change. The active bank details of an employee are the details
-- of their last approved request.

-- Personal fields: phone is the first editable self-service field; email
-- already exists and stays identity-owned. The field is nullable so
-- existing rows stay valid, and provisioning never needs it.

ALTER TABLE employees ADD COLUMN phone TEXT;

-- The sixth privilege toggle (ADR-0024, amending ADR-0015's five): the
-- catalog is now submit claims, approve/reject, finance verify/pay,
-- approve bank detail changes, view org-wide activity, access the admin
-- console. Defaults follow the safe-grant pattern of migration 0025:
-- submit-only unless a seeded role legitimately needs the approval power.
-- The Finance Head reviews bank-detail changes by default; Superadmin holds
-- every privilege by construction and is backfilled for consistency.

ALTER TABLE roles ADD COLUMN can_approve_bank_details boolean NOT NULL DEFAULT false;

UPDATE roles SET can_approve_bank_details = true WHERE code IN ('finance-head', 'superadmin');

-- One bank-detail change request per submission: the employee, the
-- requested account, the requester, the reviewer, and the decision. The
-- status column carries the decision for cheap listing; the full audit
-- trail (who did what when) lives in the request events table, mirroring
-- how claim status and claim history events split.

CREATE TABLE bank_detail_change_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  requester_id TEXT NOT NULL REFERENCES employees(id),
  reviewer_id TEXT REFERENCES employees(id),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_bank_detail_requests_employee ON bank_detail_change_requests (employee_id);
CREATE INDEX idx_bank_detail_requests_org_status ON bank_detail_change_requests (organization_id, status);

CREATE TABLE bank_detail_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES bank_detail_change_requests(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('submitted', 'approved', 'rejected')),
  actor_id TEXT REFERENCES employees(id),
  actor_name TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_bank_detail_request_events_request ON bank_detail_request_events (request_id);
