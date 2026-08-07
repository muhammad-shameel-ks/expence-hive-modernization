import {
  MAX_RECEIPT_SIZE_BYTES,
  receiptSizeLimitLabel,
} from "@/server/expenses/receipt-validation";

export { MAX_RECEIPT_SIZE_BYTES, receiptSizeLimitLabel };

// The client gate mirrors the server's authoritative set: only PDF passes.
// An empty declared type and application/octet-stream (the wire form of an
// absent declaration in multipart bodies) are allowed; the server sniffs
// magic bytes and is authoritative for those files.
const RECEIPT_TYPES = new Set(["application/pdf", "application/octet-stream"]);

export function receiptValidationError(file: File): string | null {
  if (file.type !== "" && !RECEIPT_TYPES.has(file.type)) {
    return "Receipts must be a PDF file.";
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return `The receipt is larger than ${receiptSizeLimitLabel()}.`;
  }
  return null;
}

