-- Remove bank account number and IFSC code columns from reimbursement_claims.

ALTER TABLE reimbursement_claims
  DROP COLUMN IF EXISTS account_number,
  DROP COLUMN IF EXISTS ifsc_code;
