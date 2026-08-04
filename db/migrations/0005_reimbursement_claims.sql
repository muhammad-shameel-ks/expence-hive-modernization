-- Reimbursement vertical slice: claims, approval steps, history, and payment metadata.

CREATE TABLE hierarchy_assignments (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  manager_id TEXT NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (employee_id <> manager_id)
);

CREATE TABLE reimbursement_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  requester_id TEXT NOT NULL REFERENCES employees(id),
  reference TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  expense_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Personal card', 'Company card')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'in-approval', 'needs-correction', 'rejected', 'in-finance', 'paid')),
  current_stage TEXT CHECK (current_stage IN ('manager', 'it', 'ceo', 'finance')),
  current_actor_id TEXT REFERENCES employees(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_attachments (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES reimbursement_claims(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status = 'available'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_approval_steps (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES reimbursement_claims(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  stage TEXT NOT NULL CHECK (stage IN ('manager', 'it', 'ceo', 'finance')),
  assigned_actor_id TEXT NOT NULL REFERENCES employees(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'verified', 'paid')),
  decided_at TIMESTAMPTZ,
  UNIQUE (claim_id, position),
  UNIQUE (claim_id, stage)
);

CREATE TABLE claim_history_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES reimbursement_claims(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'submitted', 'approved', 'correction', 'rejected', 'verified', 'paid')),
  actor_id TEXT NOT NULL REFERENCES employees(id),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE claim_payments (
  claim_id TEXT PRIMARY KEY REFERENCES reimbursement_claims(id) ON DELETE CASCADE,
  verifier_id TEXT REFERENCES employees(id),
  verified_at TIMESTAMPTZ,
  payment_actor_id TEXT REFERENCES employees(id),
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_reimbursement_claims_requester ON reimbursement_claims (requester_id, created_at DESC);
CREATE INDEX idx_reimbursement_claims_actor ON reimbursement_claims (current_actor_id, status);
CREATE INDEX idx_claim_steps_actor ON claim_approval_steps (assigned_actor_id, status);
CREATE INDEX idx_claim_history_claim ON claim_history_events (claim_id, created_at);
