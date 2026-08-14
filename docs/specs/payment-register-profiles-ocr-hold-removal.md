# ExpenseHive Payment Register, Profiles, OCR, and Hold Removal

Status: proposed implementation baseline.

This specification synthesizes the plan-maxxing session on bulk payments, approval comments, role-based UI, the profiles page with bank details, OCR receipt extraction, and the removal of the hold feature.
The architecture decisions ADR-0023 through ADR-0028 record the individual decisions; this document is the product-level baseline that ties them together.

## Problem Statement

Payments today are single-claim actions: finance verifies a claim and marks it paid immediately, even though companies actually pay reimbursements in periodic bulk runs.
There is no way to select a batch of verified claims, hand the batch to the external bank-processing step, and confirm the batch as paid when processing completes.

The payment queue renders every claim in the payment lifecycle, including rejected claims, so finance must filter through non-actionable rows to reach the verified ones, and there is no org-wide view of every expense at every stage.

Approvals record only an actor and a timestamp; an approver cannot attach a comment explaining an approval, while rejections already carry a required reason.

The dashboard layout is identical for every role below the stat cards, even though a Finance Executive's attention surface and an employee's expense list deserve different emphasis.

Employees have no self-service profile, and no bank details exist anywhere in the system, so payment completion cannot reference an account and a payment register has nothing to carry.

Employees retype expense facts from their receipts by hand; OCR receipt extraction is listed as a near-term enhancement and has no design.

The hold feature (ADR-0016) provides a pause-and-fix correction path that contradicts the outright rejection model: product direction is that the only correction path is a rejection followed by a new claim, so the entire hold feature must be removed.

## Solution

Six connected work items: the hold removal and the bank-details privilege land first because the payment register, the privilege catalog, and the dashboards hang off them.

### 1. Payment register round-trip (ADR-0023)

- Verified is the only waiting state: claims verified by finance stay `verified` and accumulate in the queue; no new intermediate status exists.
- The payment queue renders only verified claims; the ADR-0008 rejected-claims-in-queue treatment is removed.
- Every-stage visibility moves to a new org-wide finance expense list view that reuses the unified one-per-status filter component (ADR-0021); `/expenses/all` stays viewer-scoped to the user's own claims.
- A new Excel export, distinct from the existing queue exports (ADR-0010), produces a payment register for the current selection: employee, amount, bank details (holder name, account number, IFSC, bank name, branch), and the internal expense ID that anchors the round trip.
- The register is handed to the external financial processing step; the same file is later dragged back onto the payments tab.
- The dragged file is uploaded to a protected server route that parses it, extracts and validates the expense IDs, and returns the matching claims for auto-selection; parsing never happens in the browser, and a keyboard-reachable file input accompanies the drop zone.
- Auto-selected claims are bulk-marked paid like any selection; no claim is paid without the finance person confirming.
- Bulk payment validates every selected claim at execution: ineligible rows are skipped and reported afterward, eligible rows are paid - partial success is the expected outcome.
- Bulk selection, register export, drag-back import, and bulk pay are available to any role whose record carries the finance verify/pay privilege.
- Each paid claim records its own `paid` history event with actor and timestamp; the register itself is not a new domain entity.

### 2. Optional approval comments (ADR-0028)

- The approve action gains an optional free-text comment field; an approval without a comment is valid.
- A provided comment is stored on the `approved` history event with actor and timestamp, mirroring the rejection reason (ADR-0009).
- Approval comments render wherever rejection reasons render today: the journey timeline, the expense drawer, the activity feed, and the expense summary PDF.
- No separate comment entity: the comment lives only on the history event.

### 3. Role-adaptive dashboard layouts (ADR-0027)

- Dashboard component order and sizing become hardcoded per viewer role, expressed as a per-role component map in one place.
- Employee: the expense list is the primary surface, full width; the attention card appears only when it has content.
- Approver and Finance: the "needs your attention" card renders first and wider, with the expense list below.
- Superadmin: admin-first default.
- The approver card set loses "my holds" with the hold removal and is re-tuned around awaiting-my-action and aging.
- The tuning covers the dashboard page only.

### 4. Profiles page and bank details (ADR-0024)

- A new profiles page shows the employee's identity (name, email, role, department, manager) and lets them edit personal fields and bank details.
- Bank details are holder name, account number, IFSC, bank name, and branch, validated on save with format checks for account number and IFSC.
- A bank-details change is not self-service: it enters a pending state and takes effect only after a role carrying the new `approve bank detail changes` privilege approves it.
- A person cannot approve their own bank-details change; the request routes to another holder of the privilege.
- The privilege catalog becomes: submit claims, approve/reject, finance verify/pay, approve bank detail changes, view org-wide activity, access the admin console - still six toggles (ADR-0015, amended).
- Drafts may be created without bank details; the first submission is blocked with a pointer to the profiles page until an approved bank detail record exists, enforced server-side.
- Payments use the employee's currently-approved bank details at the moment of payment execution; no per-claim bank snapshot is taken, and the paid history event records the account that was used.
- The approving role needs a surface listing pending bank-detail change requests.

### 5. OCR receipt extraction (ADR-0025)

- OCR is a server-side provider adapter behind the command boundary: a production adapter (Azure AI Document Intelligence is the leading candidate) and a local dev fallback (Tesseract or a deterministic stub), mirroring the blob and email adapters.
- The first vertical slice extracts from PDF receipts only; camera images are deferred.
- Amount, date, vendor, and a best-effort category suggestion are prefilled into the draft form; every value is a suggestion the employee accepts or edits before submission, and the category suggestion is explicitly marked as a guess.
- Unreadable receipts yield no suggestions and a clear message; the receipt-first flow always remains usable without OCR.

### 6. Remove the hold feature (ADR-0026)

- The held claim status, hold and resume actions, the required hold reason, `held` and `resumed` history events, the Held badge, the held-claims admin oversight view, and the absence-sweep hold exemption are all removed.
- The hold privilege toggle is removed from the per-role catalog.
- The ADR-0017 clause that delegating a held claim does not clear the hold is retired; delegation re-points the current actor with no hold interaction.
- The ADR-0018 absence sweep applies to every pending claim with no exemption; delegation is the explicit rescue when an assignee is unavailable.
- The approver dashboard's "my holds" card is replaced by the role-adaptive layout tuning.
- Persisted held claims are auto-resumed by a migration: they become actionable again at their stage, with an audit note recording the auto-resume.

## User Stories

### Bulk payment

1. As a Finance user, I want the payment queue to show only verified claims, so that every row in the queue is actionable without filtering.
2. As a Finance user, I want to cherry-pick individual verified claims in the queue, so that I can assemble exactly the batch I intend to pay.
3. As a Finance user, I want to export the selected claims as a payment register Excel file including employee, amount, and bank details, so that the external financial processing step has everything it needs.
4. As a Finance user, I want the register to carry the internal expense ID for each claim, so that the file can be matched back to claims on import.
5. As a Finance user, I want to drag the same register file back onto the payments tab, so that the claims in it are auto-selected without re-picking them by hand.
6. As a Finance user, I want a keyboard-reachable file input alternative to the drop zone, so that the import works without a mouse.
7. As a Finance user, I want to review the auto-selected claims and then confirm bulk payment, so that no claim is paid without an explicit confirmation.
8. As a Finance user, I want claims in the file that are no longer eligible (already paid, no longer verified) to be skipped and reported, so that a partial run still completes and I know what did not pay.
9. As a Finance user, I want a single claim to remain payable on its own, so that one-off payments outside a run still work.
10. As a Finance user, I want every paid claim in a run to record its own paid event with actor and timestamp, so that the audit trail is unchanged per claim.
11. As an administrator, I want the bulk payment surface to appear for any role carrying the finance verify/pay privilege, so that I can grant or remove it per role.
12. As a Finance user, I want an org-wide expense list view with the unified one-per-status filter chips, so that I can inspect every claim at every stage without leaving finance.
13. As an employee, I want my own expenses page to keep showing only my claims, so that my view is not flooded by company-wide data.

### Approval comments

14. As an approver, I want to attach an optional comment when approving, so that I can explain my decision without adding friction to every approval.
15. As a requester, I want to see approval comments in the journey timeline, drawer, and activity feed, so that I understand why a claim was approved.
16. As a requester, I want approval comments included in the expense summary PDF, so that the printed record carries the decision context.
17. As an approver, I want an empty approval without a comment to remain valid, so that routine approvals are not slowed down.

### Role-based UI

18. As a Finance Executive, I want "needs your attention" to appear first and wider on my dashboard, so that my actionable queue is the first thing I see.
19. As an employee, I want my expense list full-width first on my dashboard, so that my own money position leads the page.
20. As an approver, I want my attention card first, so that my decision queue leads the page.
21. As a Superadmin, I want the admin-first default layout, so that the dashboard matches my operational role.
22. As any user, I want the attention card to disappear when it has no content in my layout, so that the page never shows an empty panel.

### Profiles and bank details

23. As an employee, I want a profiles page where I can see my name, email, role, department, and manager, so that I know how the system sees me.
24. As an employee, I want to edit personal fields on the profiles page, so that my contact details stay current.
25. As an employee, I want to enter and submit bank details (holder name, account number, IFSC, bank name, branch) from the profiles page, so that I can be paid.
26. As an employee, I want my bank-details change to enter a pending state rather than apply immediately, so that a changed account is never silently active.
27. As an employee, I want to see the status of my pending bank-details change, so that I know when it takes effect.
28. As a finance approver, I want to see pending bank-detail change requests, so that I can approve or reject them before they take effect.
29. As a finance approver, I want to be blocked from approving my own bank-details change, so that self-approval is impossible.
30. As an administrator, I want to assign the `approve bank detail changes` privilege to any role, so that the approval authority matches company policy.
31. As an employee, I want to create and save expense drafts without bank details, so that I can prepare work before completing my account setup.
32. As an employee, I want my first submission without approved bank details to be blocked with a pointer to the profiles page, so that I know exactly what to fix.
33. As a Finance user, I want the currently-approved bank details used at payment time, so that payments always go to the account that was approved when the run executes.
34. As an employee, I want my bank-details history to record who approved what when, so that account changes are auditable.

### OCR

35. As an employee, I want the receipt-first flow to read a PDF receipt and suggest amount, date, and vendor into my draft, so that I do not retype common facts.
36. As an employee, I want a best-effort category suggestion marked as a guess, so that I never mistake it for a policy decision.
37. As an employee, I want to accept or edit every OCR suggestion before submission, so that no extracted value reaches a claim silently.
38. As an employee, I want an unreadable receipt to produce no suggestions and a clear message, so that the flow still works without OCR.
39. As a developer, I want OCR to run behind a provider adapter with a local fallback, so that local development never depends on Azure.

### Hold removal

40. As an approver, I want no hold action anywhere in the claim surfaces, so that the pause-and-fix path is gone.
41. As a requester, I want no Held status or badge, so that the status model has no in-between pause state.
42. As a requester, I want the only correction path to be a rejection followed by a new claim, so that outcomes are unambiguous.
43. As a Superadmin, I want the hold privilege toggle gone from the role editor, so that the privilege catalog matches the removed feature.
44. As a Superadmin, I want the held-claims oversight view gone, so that no surface references the removed state.
45. As a Superadmin, I want the absence sweep to apply to every pending claim with no exemption, so that idle stages still advance on the configured timeout.
46. As a Superadmin, I want delegation to be the only re-routing tool, so that unavailable assignees are handled explicitly.
47. As a developer, I want a migration that auto-resumes persisted held claims with an audit note, so that no claim is stranded by the feature removal.

## Implementation Decisions

### Domain model

- The claim status model loses `held`; no status is added for the payment run - `verified` remains the waiting state.
- History gains the `approved` event detail for optional comments; `held` and `resumed` event kinds are removed.
- A bank-detail change request is a new domain concept: employee, requested bank details, status (pending, approved, rejected), requester, reviewer, timestamps, and history.
- The payment register is not a domain entity; it is a transient export/import artifact carrying employee, amount, bank details, and expense IDs.

### Command boundary

- `approveStage` gains an optional comment parameter; the comment is recorded on the history event and never on a claim-level comments field.
- A new bulk payment command accepts a set of claim IDs, validates each claim's eligibility at execution, pays the eligible ones, and returns a per-claim report of skipped rows.
- A new register import command receives the uploaded Excel file, parses it server-side, validates expense IDs, and returns the matching claims for selection.
- `markPaid` stays for single-claim payments; the bulk command shares its eligibility logic.
- A bank-detail change request command replaces direct bank-detail writes: submit change, approve change, reject change; the active bank details are the last approved record.
- The submission command refuses claims from employees without an approved bank detail record, server-side.
- The bulk payment command reads the currently-approved bank details at execution and records them on the paid event.
- Hold-related commands and checks are deleted; the absence sweep logic drops its held exemption.

### Authorization

- The privilege catalog is amended to: submit claims, approve/reject, finance verify/pay, approve bank detail changes, view org-wide activity, access the admin console.
- Bulk payment capabilities ride the finance verify/pay privilege; the register export, drag-back import, and bulk pay require it.
- Approving a bank-detail change requires the `approve bank detail changes` privilege and must never be the change requester.

### Read models and UI

- The payment queue read model filters to verified claims; the org-wide finance list view reads every claim with the unified filter component.
- The dashboard renders from a per-role component map: employee, approver, finance, superadmin layouts.
- The profiles page renders identity, editable personal fields, bank details, and change-request history.
- The finance approval surface for bank changes lists pending requests with the requested and current details side by side.
- The receipt-first flow gains a suggestions state after OCR extraction, with per-field accept/edit controls.

### OCR

- OCR sits behind a server-side extraction interface with a production adapter (Azure AI Document Intelligence candidate) and a local fallback (Tesseract or deterministic stub).
- The first slice covers PDF receipts; fields are amount, date, vendor, and a best-effort category guess, always presented as editable suggestions.
- The research phase compares providers on accuracy, cost, data privacy, and integration fit before the production adapter is configured.

### Migration

- Held claims are auto-resumed with an audit note; held-related data is removed from the schema and seed data.
- Existing queue exports (ADR-0010) remain untouched; the register export is a separate export path.

## Testing Decisions

Tests should assert externally observable behavior: state transitions, authorization, per-claim reports, audit events, and provider interactions, not component internals.

The server-side command boundary is the highest-value seam; bulk payment, register import, bank-detail change approval, and submission gating are tested through it.

Domain tests should cover the eligibility logic of bulk payment (partial success, already-paid rows, no-longer-verified rows), the bank-details submission gate, the self-approval block, and the migration auto-resume.

Component tests should cover the per-role dashboard layout map, the register drop zone with its keyboard alternative, the bank-change approval surface, and the OCR suggestions UI with accept/edit behavior.

The OCR adapter needs contract tests against the local fallback, mirroring the existing blob and email adapter contract tests.

Prior art to extend: the payment queue selection tests, the dashboard attention and stats tests, the approval workflow command tests, and the receipt-first flow tests.

Existing tests that reference holds, the Held badge, hold privileges, or the held-claims view must be updated to the removed feature as part of this work.

## Out of Scope

- Camera-image OCR; the first slice is PDFs only.
- An automatic payout channel or bank integration; the register round trip stays manual.
- A PaymentRun entity with prepare/approve/execute lifecycle; the register stays a transient artifact.
- Per-company configurable dashboard layouts; the per-role map is hardcoded.
- Bank-detail snapshots per claim; payments read live approved details.
- Email notifications for bank-change approvals; the approval surface is in-app.
- Reintroducing any pause or correction state to claims.

## Further Notes

The register export deliberately carries bank details and internal expense IDs in an external file; the drag-back import is server-side and format-checked, and finance must reconcile pending bank-detail change requests against a register before executing a run.

The privilege catalog stays at six toggles: the hold toggle is removed and the bank-approval toggle is added in the same change.

The approval-revamp spec (ADR-0015 through 0021) remains the baseline for the features it describes; this spec amends it where noted.

## References

- ADRs: 0023 payment register round-trip, 0024 profiles page and bank details, 0025 OCR receipt extraction adapter, 0026 hold removal, 0027 role-adaptive dashboard layouts, 0028 optional approval comments.
- Domain glossary: `CONTEXT.md` (Payment register, Org-wide finance list view, Bank details, Approval comment, OCR extraction, Hold as retired).
- Prior baseline: `docs/specs/approval-revamp-hold-delegation-dashboard.md` (ADR-0015 to 0021).
- UX baseline: `docs/ux/ux-research.md`.
