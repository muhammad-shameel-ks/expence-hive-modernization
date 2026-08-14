# ADR-0024: Profiles Page and Bank Details

Status: accepted.

## Context

Employees currently have no self-service profile surface, and no bank details exist anywhere in the system.
Payment completion therefore cannot reference an account, and a payment register export (ADR-0023) has nothing to carry.
The company pays through bank transfers, so the holder name, account number, IFSC, bank name, and branch are the required account facts.
Changing bank details is the classic payment-fraud vector: a silently changed account can redirect a legitimate payment.

## Decision

1. **Profiles page.**
   A new profiles page shows the employee's identity (name, email, role, department, manager) and lets them edit personal fields and bank details.
   Bank details are holder name, account number, IFSC, bank name, and branch, validated on save (format checks for account number and IFSC).
2. **Bank-details changes require approval.**
   A bank-details change is not self-service: it enters a pending state and takes effect only after a role carrying the new `approve bank detail changes` privilege approves it.
   The privilege is admin-assignable per role like every other toggle (ADR-0015).
   A person cannot approve their own bank-details change; the request must route to another holder.
3. **Privilege catalog.**
   With the hold toggle removed (ADR-0026) and the bank-approval toggle added, the fixed catalog remains six toggles: submit claims, approve/reject, finance verify/pay, approve bank detail changes, view org-wide activity, access the admin console.
4. **Submission gate.**
   Drafts may be created without bank details; the first submission is blocked with a pointer to the profiles page until an approved bank detail record exists.
   The gate is enforced server-side, not only in the UI.
5. **Live bank details at payment.**
   Payments use the employee's currently-approved bank details at the moment of payment execution (ADR-0023).
   No per-claim bank snapshot is taken; the paid history event records the account that was used.

## Consequences

Employees gain a self-service surface; bank changes are audited and gated behind finance-approved requests, trading speed for safety.
The register export may carry an account that a later approved change supersedes, so finance must reconcile pending change requests against a register before paying (ADR-0023).
A pending bank-change request surface is needed for the approving role.

## Revisit When

If the company moves to an automated payout channel, the live-at-payment rule may need to become a snapshot at register export so the payout instruction and the record always agree.
