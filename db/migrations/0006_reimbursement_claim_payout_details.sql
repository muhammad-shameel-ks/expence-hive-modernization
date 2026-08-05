-- Payout details captured on a reimbursement claim so Finance and HR can process payment.

ALTER TABLE reimbursement_claims
  ADD COLUMN account_number TEXT,
  ADD COLUMN ifsc_code TEXT;
