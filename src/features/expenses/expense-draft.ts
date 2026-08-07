import type { ExpenseClaim } from "@/server/expenses/ports";

// Legacy placeholder attachment rows (empty digest) reference no stored
// object; only a digest-backed receipt can be surfaced as already attached.
export function draftAttachmentFileName(claim: ExpenseClaim): string | undefined {
  return claim.attachment?.contentSha256 ? claim.attachment.fileName : undefined
}
