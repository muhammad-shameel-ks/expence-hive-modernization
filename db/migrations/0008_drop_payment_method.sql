-- Every expense is paid from the employee's own card and reimbursed,
-- so the payment method carries no information. Drop the column and its check constraint.

ALTER TABLE reimbursement_claims DROP COLUMN payment_method;
