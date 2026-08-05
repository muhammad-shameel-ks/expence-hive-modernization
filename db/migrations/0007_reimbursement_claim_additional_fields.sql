-- Sub category, remark, and Finance/HR-authored comments, matching the legacy Reimbursement Requests table.

ALTER TABLE reimbursement_claims
  ADD COLUMN sub_category TEXT,
  ADD COLUMN remark TEXT,
  ADD COLUMN comments TEXT;
