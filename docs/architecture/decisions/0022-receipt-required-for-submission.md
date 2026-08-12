# ADR-0022: Receipt Required for Submission

Status: accepted.

## Context

ADR-0007 described receipts as optional with a skip path in the creation wizard, and the product spec (story 72 in `docs/specs/expensehive-modernization.md`, corroborated by `docs/ux/ux-research.md`) required a clear missing-receipt exception path so employees are not forced to work around the form when evidence is unavailable.

Finance's operating reality overrode that design: a claim without a receipt cannot be reimbursed, and allowing employees to proceed without one only produced claims that were rejected later with "Missing itemized receipt". The business decided the receipt is mandatory from the creation flow onward.

## Decision

1. **The receipt-first wizard no longer offers "Skip for now".** Step 1 (receipt) has no escape hatch; the wizard can only advance once a receipt is attached or a stored receipt exists on a resumed draft.
2. **Submission is the server-side enforcement point.** `submitClaim` rejects a draft with no attachment (`validation` error: "A receipt is required before this claim can be submitted."), so no claim enters the approval pipeline without its receipt regardless of what the client sends.
3. **Receipt-less drafts may still exist and be edited.** Autosave and resumed legacy drafts without a receipt remain valid draft state; the employee attaches a receipt to continue, or cancels. The exception path (story 72) is thus narrowed to drafts, not submissions.

## Consequences

- The creation flow is single-purpose: proof first, then context, then submit. The "Receipt skipped" chip and the review-step exception-path hint are removed as unreachable states.
- Server tests that previously submitted receipt-less drafts now attach receipts; new tests cover the rejection at both the command and HTTP boundaries.
- This ADR supersedes the "receipts are optional (skip path)" stance of ADR-0007 and partially supersedes story 72 and the exception-path language in `docs/ux/ux-research.md` and `docs/architecture/modernization.md`.

## Revisit When

If Finance adopts an approved exception flow for lost or unavailable receipts, this ADR is amended to reintroduce a gated path (for example Superadmin-reviewed) rather than a free skip.
