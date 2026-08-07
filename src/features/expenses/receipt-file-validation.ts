// Mirrors the server's default cap so an oversized file fails fast without
// a round trip. The server stays authoritative (the cap is configurable
// there); this is a convenience check, not a security boundary.
export const MAX_RECEIPT_SIZE_BYTES = 25 * 1024 * 1024;

// The client gate mirrors the server's authoritative set: only PDF passes.
// An empty declared type and application/octet-stream (the wire form of an
// absent declaration in multipart bodies) are allowed; the server sniffs
// magic bytes and is authoritative for those files.
const RECEIPT_TYPES = new Set(["application/pdf", "application/octet-stream"]);

export function receiptValidationError(file: File): string | null {
  if (file.type !== "" && !RECEIPT_TYPES.has(file.type)) {
    return "Receipts must be a PDF file.";
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) return "The receipt is larger than 25 MB.";
  return null;
}
