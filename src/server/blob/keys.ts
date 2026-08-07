export const RECEIPTS_CONTAINER = "receipts";

export type ReceiptContentType = "application/pdf";

// Extensions are derived from the server-detected content type, never from
// the client-supplied file name (ADR-0004). Every accepted receipt content
// type has an entry; the caller guarantees the type is one of these.
export const RECEIPT_EXTENSIONS: Record<ReceiptContentType, string> = {
  "application/pdf": "pdf",
};

export function buildBlobKey(
  organizationId: string,
  claimId: string,
  attachmentId: string,
  contentType: ReceiptContentType,
): string {
  return `${organizationId}/${claimId}/${attachmentId}.${RECEIPT_EXTENSIONS[contentType]}`;
}
