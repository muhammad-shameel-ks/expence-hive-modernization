import { RECEIPT_EXTENSIONS, type ReceiptContentType } from "../blob/keys";

// The cap defaults to 25 MB and is overridable through
// MAX_RECEIPT_SIZE_BYTES (a positive integer); unset or invalid values
// fall back to the default.
export const MAX_RECEIPT_SIZE_BYTES = maxReceiptSizeBytes();

function maxReceiptSizeBytes(): number {
  const raw = process.env.MAX_RECEIPT_SIZE_BYTES;
  if (raw === undefined) return 25 * 1024 * 1024;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 25 * 1024 * 1024;
}

// A human-readable rendering of the configured cap for user-facing messages
// ("25 MB" for the default; whole bytes when the cap is not a whole MB).
export function receiptSizeLimitLabel(): string {
  const megabytes = MAX_RECEIPT_SIZE_BYTES / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} MB` : `${MAX_RECEIPT_SIZE_BYTES} bytes`;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWith(data: Uint8Array, magic: number[]): boolean {
  if (data.length < magic.length) return false;
  return magic.every((byte, index) => data[index] === byte);
}

// The server detects the receipt format from magic bytes instead of trusting
// the browser-declared content type (ADR-0004); only PDF is an accepted
// receipt format.
export function sniffContentType(data: Uint8Array): ReceiptContentType | null {
  if (startsWith(data, PDF_MAGIC)) return "application/pdf";
  return null;
}

// Resolves the authoritative receipt content type: the sniffed format wins
// when the declared type is empty or absent. Browsers omit the type for
// some files and undici's multipart encoding normalizes that absence to
// "application/octet-stream" on the wire, so both count as absent. Any
// other declared type must be an accepted receipt type that matches the
// bytes; a spoofed or mismatched declaration is rejected.
export function resolveReceiptContentType(
  declared: string,
  data: Uint8Array,
): ReceiptContentType | null {
  const sniffed = sniffContentType(data);
  if (sniffed === null) return null;
  if (declared === "" || declared === "application/octet-stream") return sniffed;
  if (!(declared in RECEIPT_EXTENSIONS)) return null;
  if (declared !== sniffed) return null;
  return sniffed;
}
