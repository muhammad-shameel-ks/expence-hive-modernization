# ExpenseHive

The reimbursement application where employees submit expense claims, approvals route through managers and Finance, and receipt files are stored privately in blob storage.

## Language

**Receipt**:
The proof-of-expense file an employee attaches to a claim (photo, scan, or PDF).
A receipt is optional: a claim may proceed without one through the skip path.
_Avoid_: Document, proof file, invoice

**Attachment**:
The claim's stored reference to its receipt: file name, content type, size, content digest, and the blob key where the bytes live.
A claim has at most one attachment, created together with the claim.
_Avoid_: Upload, blob record

**Blob key**:
The path inside the private `receipts` container where receipt bytes live, always derived server-side as `{organizationId}/{claimId}/{attachmentId}.{ext}`.
Client-supplied file names never enter the key.
_Avoid_: Storage key, file path, object name

**Receipt-first flow**:
The /expenses/new wizard that starts with proof before details: pick a receipt, fill the gaps, review and submit.
_Avoid_: Upload flow, new claim form

**Draft**:
A claim saved but not yet submitted, owned only by its requester.
Drafts can be continued (fields edited and a receipt added) or deleted; both actions are requester-only and disappear once the claim is submitted.
_Avoid_: Saved claim, working copy

**Receipt preview**:
The live PDF view of a claim's receipt in `ReceiptPreview`, with two sources: a locally picked `File` rendered client-side before any upload, or a stored receipt fetched through the authorized server proxy by claimId.
A preview is never a download: bytes stay in the client or behind the server's authorization and integrity checks.
_Avoid_: Viewer, PDF view, thumbnail

**Preview surface**:
The persistent receipt-preview area of the receipt-first flow: embedded in the CaptureRail on desktop, a "View receipt" button opening a full-screen sheet on mobile.
It materializes only when a receipt exists (picked file or stored receipt); it is never an empty placeholder.
_Avoid_: Preview panel, receipt pane

**Payment queue**:
The Finance-only list of claims in the payment lifecycle: awaiting payment, paid, and rejected.
Rejected claims appear so Finance keeps the full record visible, but they are frozen - no comment editing and no terminal actions (ADR-0008).
_Avoid_: Finance tab, payout list

**Export current view**:
The Excel export option that mirrors the queue exactly as filtered: the search text, status/category/amount/date filters, and the sort all apply.
_Avoid_: Filtered export, WYSIWYG export

**Full queue export**:
The Excel export option that ignores all filters and search and contains every claim in the payment queue.
_Avoid_: Everything export, database export

**Expense summary PDF**:
The server-generated PDF of a single claim: expense facts, the approval journey timeline, and comments, with the original receipt PDF attached as a file attachment (ADR-0011).
Downloadable from the expense drawer for every status and from the queue's side panel header.
_Avoid_: Receipt download, claim report

**Rejection reason**:
The required reason recorded when a claim is rejected.
It lives only as a history event (kind `rejected`) with actor and timestamp, and is rendered read-only in comment surfaces; it is never written into the claim's comments field (ADR-0009).
_Avoid_: Rejection note, decline reason

**Amount guard**:
An optional condition on a workflow node: `operator + amount` (operators `>=`, `>`, `<=`, `<`), read as "this node runs only when the claim total satisfies the operator".
A guard whose condition fails auto-skips the node; the flow continues at the next node (ADR-0012).
_Avoid_: Threshold, limit, amount condition branch

**Claim total**:
The sum of the claim's expense lines, computed server-side once at submission.
It is the amount every guard evaluates, and it is frozen with the claim like the captured workflow version.
_Avoid_: Requested amount, total spend

**Auto-skip**:
A node that is skipped by an amount guard rather than by a person.
It is recorded as a distinct history event kind (`auto-skipped`) whose actor is the policy, with the guard reason recorded, so the journey timeline and analytics distinguish it from any human skip (ADR-0013).
_Avoid_: Policy skip, automatic waiver

**Absence auto-skip**:
A pending stage skipped because its assigned actor has not decided within the company's configured absence timeout, or because the stage is vacant (no active employee holds it).
The timeout is a single company-wide setting, defaulting to 3 days, configurable by Superadmin in the admin panel and enforced by a scheduled sweep job plus the lazy read-path backstop (ADR-0018).
Held claims are exempt: a hold outranks the timeout (ADR-0016).
_Avoid_: Timeout skip, stale-stage skip, no-response skip

**Amount overrun approval**:
Retired concept: the requirement of an extra higher-up approval when a claim exceeds an amount.
It is now expressed as an ordinary amount guard on a node, e.g. "Finance Head approval runs only when total >= 5000" (ADR-0012).
_Avoid_: Over-limit approval, escalation node

**Takeover**:
Retired concept (ADR-0017): an approver acting on a claim ahead of its currently assigned step, jumping the pending steps in between, recorded as a `takeover` history event.
Takeover is removed entirely and replaced by delegation: the administrator re-routes a claim but never acts on it.
_Avoid_: Override, escalate, reassign

**Apex bypass**:
Retired concept (ADR-0017): the unconditional form of takeover, where Finance Head or Superadmin could jump every pending step and act on a claim.
Replaced by delegation with positional auto-skip: when the admin delegates to someone higher in the flow, the intermediate pending steps skip to that person (ADR-0017).
_Avoid_: Admin override, full bypass

**Positional bypass**:
Retired concept (ADR-0017): the conditional form of takeover, where a role could jump ahead only when a later pending step targeted that role.
Removed with takeover; no remaining feature allows a non-admin to advance a claim ahead of its steps.
_Avoid_: Skip-ahead, jump approval

**Delegation**:
The Superadmin-only action of re-pointing an in-flight claim's current task to another specific person, without acting on the claim.
Delegating to someone whose role sits later in the claim's frozen steps auto-skips the intermediate pending steps and lands the claim at that step; any other target (same stage, or a role absent from the flow) acts at the current stage - only the person changes.
A required reason is recorded as a `delegated` history event plus one `skipped` event per intermediate step (ADR-0017).
Delegating a held claim does not clear the hold; the new actor resumes it (ADR-0016).
_Avoid_: Hand off, reassign, takeover, reassign task

**Hold**:
A claim paused at any stage by its current actor (a role with the hold privilege), recorded as a `held` history event with a required reason.
Held claims keep their flow position, show a Held badge everywhere, and are frozen against terminal actions.
The current stage actor resumes (a `resumed` event); Superadmin keeps a held-claims oversight view, and holds are exempt from the absence sweep (ADR-0016).
_Avoid_: Freeze, pause, on-hold claim

**Privilege toggle**:
One of the six fixed role capabilities stored per role record - submit claims, approve/reject, finance verify/pay, hold, view org-wide activity, access the admin console - editable for the five predefined roles and for custom roles.
Delegation and company auto-skip configuration are Superadmin-only built-ins and are never toggles (ADR-0015).
_Avoid_: Permission flag, role grant, capability switch

**Expense drawer**:
The single right-side drawer component (`ExpenseDrawer`) that renders a claim's facts, journey timeline, and next actions (approve/reject, verify/pay, hold, download summary, and Superadmin-only delegation).
Used from both the dashboard and the payment queue (ADR-0014) - one component, multiple call sites, no per-feature drawer variants.
_Avoid_: Detail panel, claim modal, side sheet

**Department head**:
The manager a department is created with; departments require a head (ADR-0019).
A new employee's manager is locked to their department head at creation (read-only in the create form, blocking submission for a headless department) and changeable only afterward via the existing manager assignment.
_Avoid_: Department manager, dept lead, department owner

**Receipt panel**:
The payment queue's left/inline panel that shows only the claim's receipt PDF (or a "no receipt attached" fallback) while the table shrinks beside it.
Deliberately does not render the journey timeline - that lives only in the expense drawer (ADR-0014).
_Avoid_: PDF viewer, cross-check panel, side panel
