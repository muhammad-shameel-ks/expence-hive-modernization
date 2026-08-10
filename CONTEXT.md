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
It is recorded as a distinct history event kind (`auto-skipped`) whose actor is the policy, with the guard reason recorded, so the journey timeline and analytics distinguish it from a takeover skip (ADR-0013).
_Avoid_: Policy skip, automatic waiver

**Amount overrun approval**:
Retired concept: the requirement of an extra higher-up approval when a claim exceeds an amount.
It is now expressed as an ordinary amount guard on a node, e.g. "Finance Head approval runs only when total >= 5000" (ADR-0012).
_Avoid_: Over-limit approval, escalation node
