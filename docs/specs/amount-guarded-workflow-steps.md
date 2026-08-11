# Amount-Guarded Workflow Steps

Status: proposed implementation specification from the amount-guard planning session.

This specification extends `docs/specs/expensehive-modernization.md` and the flow administration surface in `docs/specs/hr-administration-dashboard.md` (superseded role model noted there applies: Superadmin is the administrative identity).

It is grounded in the domain decisions recorded in ADR-0012 (amount guards on workflow nodes) and ADR-0013 (distinct auto-skip history event), with glossary terms in `CONTEXT.md`: amount guard, claim total, auto-skip.

## Problem Statement

A ₹50 reimbursement and a ₹50,000 reimbursement today travel the same approval path: every step, including the Finance Head review, runs for every claim.

An organization's policy usually differs by amount - small claims should not alert the Finance Head, while large claims should keep the full review.

Without amount awareness in the flow definition, the only way to express such policy is to maintain multiple flow definitions or to make approvers informally skip small claims, both of which pollute the audit trail with human judgment that should be policy.

The current flow model has no way to express "this step applies only above a threshold" (ADR-0012).

## Solution

Allow a Superadmin to attach an optional amount guard to any step of a flow.

A guard is `operator + amount`, read as "this step runs only when the claim total satisfies the operator" - e.g. "Finance Head approval runs only when total is at least ₹5000".

When a claim is submitted, the guard is evaluated server-side against the claim total (the claim's amount; the sum of lines once multi-line claims exist), and the result is frozen with the claim.

A step whose guard fails is auto-skipped: the step is materialized as skipped and a distinct `auto-skipped` history event is recorded with the policy as actor and the guard reason, while the flow continues at the next step.

The journey timeline and PDF summary render auto-skips distinctly from human takeover skips.

Workflow validation blocks unsafe guard configurations before publication - in particular a guard on the terminal step, which the runtime never auto-skips.

The flow simulator gains an amount input so the route, including skipped steps, is visible before publication.

## User Stories

1. As a Superadmin, I want to add an optional amount guard to any step of a flow draft, so that the step applies only to claims meeting the guard.

2. As a Superadmin, I want the guard to be an operator and an amount (at least, greater than, at most, less than), so that both "small claims skip Finance" and "large claims add a review" are expressible.

3. As a Superadmin, I want the guard fields to appear on the step node in the flow editor, so that the condition is visible where the step is configured.

4. As a Superadmin, I want the amount entered in rupees with paise precision, so that the guard matches the claim currency display.

5. As a Superadmin, I want validation to reject an empty operator, a non-positive amount, or a guard on the terminal step, so that a flow cannot be published with a condition that would strand claims before payment.

6. As a Superadmin, I want the simulator to accept a representative amount and show which steps run and which are auto-skipped with their guard reason, so that I can see the route before publication.

7. As a Superadmin, I want to save and publish a validated flow with guards, so that new claims can use the amount policy.

8. As a Superadmin, I want changing a guard to require editing the flow definition, so that a claim keeps the policy under which it was submitted.

9. As an employee, I want my claim total to be computed and fixed at submission, so that the guard result is deterministic and auditable.

10. As an employee, I want a claim under a step's threshold to skip that step automatically, so that the flow advances without requiring the higher-up to be alerted.

11. As an employee, I want a claim over the threshold to route through the guarded step normally, so that large claims keep the full review.

12. As an employee, I want the journey timeline to show the auto-skipped step distinctly with its reason (e.g. "total ₹300 under ₹5000"), so that I understand why an approver never reviewed it.

13. As an employee, I want the "next action" and responsible actor to reflect only steps that actually run, so that I am not told to wait on an auto-skipped review.

14. As an approver, I want an auto-skipped step to require no decision and to be unassignable, so that I cannot approve a step policy already decided.

15. As an approver, I want the claim view to show which steps were auto-skipped and why, so that I can trust that nothing was silently bypassed.

16. As Finance, I want auto-skipped steps to be visible in the journey of the drawer and queue side panel, so that payment decisions are made with the full route in view.

17. As Finance, I want the PDF summary to render auto-skipped steps in the approval journey, so that a downloaded record matches the app view.

18. As an operations administrator, I want skipped-stage metrics to separate policy skips (`auto-skipped`) from takeover skips, so that analytics distinguish "the policy waived it" from "a person waived it".

19. As a Superadmin, I want a rejected claim resubmitted to be evaluated against the guard at the new submission, so that the route matches the policy at the time of each submission.

20. As an employee, I want a claim that never had a guarded step to flow exactly as before, so that flows without guards are unaffected.

21. As a keyboard user, I want to set the guard operator and amount without a mouse, so that amount conditions are configurable by keyboard.

22. As a screen-reader user, I want the guard fields and their validation errors to have meaningful accessible names, so that the condition is understandable without sight.

## Implementation Decisions

- Guard shape: a nullable `guard` on each flow step input, of the form `{ operator: "gte" | "gt" | "lte" | "lt"; amountMinor: number }`, where `amountMinor` is a positive integer in paise.
- Both step kinds (`role`, `team-lead`) can carry a guard; there is no restriction by target type (ADR-0012 decision 1).
- Evaluation point: at claim submission, server-side, in the command layer, before the claim's step snapshot is persisted. The claim total is the claim's amount (single-amount field today; the sum of expense lines once multi-line claims land). The result is frozen with the claim's step snapshot - later flow edits cannot change it (ADR-0012 decision 3).
- A guard that fails materializes the step with status `skipped` and appends a history event of the new kind `auto-skipped` with no personal actor, a detail such as "Total ₹300 under ₹5000 guard on Finance Head step", and the submission timestamp. The next pending step becomes current, matching the existing absent-stage advance (ADR-0013 decision 1-2).
- The existing `skipped` kind remains takeover-driven; `auto-skipped` is policy-driven. `ACTIVITY_EVENT_KINDS` is unchanged (an auto-skip is not a personal action).
- Terminal-step rule: the runtime never auto-skips the terminal step (existing rule - payment completion must not be silently bypassed), so validation rejects any guard on the terminal step. This is the concrete instance of ADR-0012 decision 5.
- Other validation rules: operator must be one of the four; `amountMinor` must be a positive integer; a step may carry at most one guard.
- Simulator: the existing "Simulate Path" action gains an amount input; the simulated route marks guarded steps as run or auto-skipped with the guard reason rendered on the step.
- Journey surfaces: `journey-meta` and the PDF summary generator render the `auto-skipped` kind with distinct styling and the guard reason; the queue side panel and drawer share the same journey model.
- Published-flow immutability follows the existing claim snapshot behavior: guards are part of the step definition, and claims materialize their steps at submission.
- Analytics: wherever skipped-stage metrics are shown, `skipped` and `auto-skipped` are counted separately.

## Testing Decisions

- The important behavior is external: a submitted claim produces the correct steps, history, and next action for amounts below, at, and above a guard - not the internals of the evaluation.
- Test the command layer in `src/server/expenses/commands.test.ts` style: under-threshold claim auto-skips the guarded step with an `auto-skipped` event and advances to the next step; over-threshold claim routes normally; exact-boundary behavior per operator (`gte` vs `gt`, `lte` vs `lt`); guard evaluation frozen on the claim snapshot; resubmission after rejection re-evaluates.
- Test the admin command layer in `src/server/admin/commands.test.ts` style: guard round-trips through create/update flow; validation rejects missing operator, non-positive amount, and terminal-step guards.
- Test the simulator output (per-step run/auto-skip with reason) as a pure function where the existing simulation logic lives.
- Test journey rendering: `journey-meta` tests gain `auto-skipped` cases; PDF summary tests assert the auto-skip event appears in the journey timeline.
- Test the flow editor UI for guard field editing, validation error display, and keyboard operability where existing flow editor tests live.
- Prior art: `src/server/expenses/commands.test.ts`, `src/server/expenses/postgres.test.ts`, `src/server/admin/commands.test.ts`, `src/features/dashboard/journey-meta.test.ts`, `src/server/expenses/summary-pdf.test.ts`.

## Out of Scope

- Guards on claim attributes other than amount (category, department, requester) - a future generalization of the guard predicate, per ADR-0012 revisit note.
- Arbitrary workflow branching, loops, or parallel approvals - unchanged and out of scope.
- Per-line routing: a multi-line claim is evaluated on its total, not per line.
- Currency conversion: amounts are INR numeric values only.
- Changing the existing vacancy/timeout auto-skip (`skipped` kind) to `auto-skipped` - existing behavior is preserved in this slice.
- Editing published flow definitions in place - existing immutability and snapshot semantics continue to govern.

## Further Notes

- The vacancy/timeout auto-skip already writes kind `skipped` with no personal actor; amount-guard skips deliberately use a separate kind so takeover skips remain the only `skipped` events. If analytics later want a unified "policy skips" bucket, that is a follow-up decision, not part of this slice.
- The exact threshold boundary (`gte` vs `gt`) is the Superadmin's responsibility; the simulator's per-amount route preview is the mitigation, per ADR-0012.
- The claim total definition should be revisited when multi-line claims land: the guard evaluates the line sum, and this spec's "claim total" glossary entry should be updated then.
