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
