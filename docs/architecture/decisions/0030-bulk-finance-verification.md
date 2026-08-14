# ADR-0030: Bulk Finance Verification

Status: accepted.

## Context

ADR-0029 gave the approvals inbox a single bulk action: `POST /api/expenses/bulk-approve`, for claims in `in-approval` status.
In practice the same inbox also lists claims in `in-finance` status that are awaiting the terminal step's Finance verification, and those claims rendered an "Approve selected" action that called the approve endpoint - which always fails, since `approveClaims` only accepts `in-approval` claims.
Finance users with multiple claims to verify had no working bulk action at all.

Separately, the in-finance branch of `listApprovalsQueue` (ADR-0029 decision 1) checked only `terminal.roleId === actor.role.id`, unlike the in-approval branch a few lines above it, which uses the shared `canActOnStep` pool check.
A finance terminal step delegated to a different role (ADR-0017: "All stages are delegatable, including finance verify/pay") never appeared in the delegatee's inbox, even though the delegatee could act on it directly via the single-claim `verifyClaim` endpoint.

## Decision

1. **Dedicated bulk-verify endpoint.** A new `verifyClaims` command and `POST /api/expenses/bulk-verify` route mirror `approveClaims`/`bulk-approve`: every selected claim is validated at execution (organization isolation, non-self-claim, terminal-pool eligibility via the shared `terminalPoolCheck`/`canActOnStep`, `in-finance` status with a pending terminal step), eligible rows are verified with their own `verified` history events, and ineligible rows are skipped and reported in a `BulkVerifyReport`. This is additive to ADR-0029 decision 3, not a replacement: `bulk-approve` is unchanged for `in-approval` claims.
2. **Shared terminal-pool eligibility.** `verifyClaims` reuses `terminalPoolCheck` (already shared by `markClaimsPaid`) instead of a bare role check, and the single-claim `verifyClaim` and bulk `verifyClaims` transitions both go through one `applyVerification` helper, matching the `applyPayment`/`applyApproval` pattern. Single-claim and bulk eligibility and the audit trail they produce cannot drift apart.
3. **Queue-filter fix.** `listApprovalsQueue`'s `in-finance` branch is corrected to use `canActOnStep` (the same pool check the in-approval branch already used), so a delegated finance terminal step is visible in the delegatee's inbox exactly when they are authorized to act on it - closing the gap this ADR's Context section describes.
4. **Per-selection action routing.** The approvals inbox table partitions the current selection by each claim's `primaryAction` (`approve` vs `verify`) and shows "Approve selected", "Verify selected", or "Process selected" for a mixed selection. A mixed selection sends both requests: one `bulk-verify` for the verify-eligible ids and one `bulk-approve` for the approve-eligible ids.
5. **Independent legs, no illusion of atomicity.** The two requests in a mixed submission are independent server calls; there is no single transaction spanning both. Each leg's success is kept even if the other leg fails: the UI removes only the ids the failing leg didn't reach, still shows any skip report from the leg(s) that ran, and states in the error message how many claims were already processed before the failure, so the user is never left believing a partial success is a total failure (or vice versa).

## Consequences

Finance users can now clear a batch of in-finance claims in one action, matching the bulk-approve workflow they already have for in-approval claims.
The approvals inbox's single "selected" action button now branches three ways instead of two; the label/description/confirm-copy ternary this requires is a known readability cost, acceptable at the current size.
A mixed-selection submission is two requests, not one: a network partition between them is a real, handled case, not a theoretical one.
The delegation queue-visibility fix changes existing behavior for any organization that had delegated a finance terminal step cross-role - such a claim now appears in an inbox it previously did not, which is the intended correction, not a regression.

## Revisit When

If a third terminal-stage bulk action is ever added, or the mixed-selection ternary cascade grows past three branches, factor the per-action label/copy into one lookup table keyed by action type instead of continuing to inline the ternary at each call site.
