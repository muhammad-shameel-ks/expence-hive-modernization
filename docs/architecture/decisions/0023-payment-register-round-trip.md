# ADR-0023: Payment Register Round-Trip

Status: accepted.

## Context

Companies typically pay reimbursements in periodic runs: verified claims accumulate in the payment queue and are paid in bulk on a schedule (monthly, fortnightly).
Today `markPaid` is a single-claim action and the payment queue renders every claim in the payment lifecycle, including rejected claims (ADR-0008).
Finance needs to select a batch of verified claims, hand the batch to the external bank-processing step, and then confirm the batch as paid when processing completes.
A bulk multi-select alone is insufficient: the batch must survive an external round trip.

## Decision

1. **Verified is the only waiting state.**
   Claims verified by finance remain `verified` and accumulate in the queue; there is no new intermediate status for the payment run.
   The queue renders only claims in the verified state - the ADR-0008 treatment of showing rejected claims in the queue is removed.
   Every-stage visibility moves to a new org-wide finance expense list view that reuses the unified one-per-status filter component (ADR-0021); `/expenses/all` stays viewer-scoped (own claims only).
2. **Payment register export.**
   A new Excel export, distinct from the existing queue exports (ADR-0010), produces a payment register for the current selection: employee, amount, bank details (holder name, account number, IFSC, bank name, branch) and the internal expense ID that anchors the round trip.
   The register is handed to the external financial processing step.
3. **Register import by drag-back.**
   The same Excel file can be dragged onto the payments tab (with a keyboard-reachable file input alternative, WCAG 2.2 AA).
   The file is uploaded to a protected server route that parses it, extracts and validates the expense IDs, and returns the matching claims for auto-selection.
   Parsing never happens in the browser.
4. **Bulk mark paid.**
   Auto-selected claims are then bulk-marked paid like any selection; no claim is paid without the finance person confirming.
   Bulk payment validates every selected claim at execution: ineligible rows (already paid, no longer verified) are skipped and reported afterward, eligible rows are paid - partial success is the expected outcome.
5. **Authorization.**
   Bulk selection, register export, drag-back import, and bulk pay are available to any role whose record carries the finance verify/pay privilege (ADR-0015); an admin can toggle the privilege per role.
6. **Audit.**
   Each paid claim records its own `paid` history event with actor and timestamp, exactly like a single-claim payment.
   The register itself is not a new domain entity.

## Consequences

The payment queue narrows to actionable work only; the finance list view carries the overview burden.
The register export embeds the internal expense ID and bank details in an external file - a deliberate sensitivity trade-off for the round trip.
Live bank details are read at payment time (ADR-0024), so a register exported before an approved bank-details change can show a different account than the one ultimately paid; finance must check pending change requests before executing a run.

## Revisit When

If companies want a named batch with its own lifecycle (prepare, approve, execute), a PaymentRun entity can be added behind the same selection surface.
