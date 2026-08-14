// The receipt extraction port (ADR-0025): OCR and text-layer reading live
// behind this server-side seam, mirroring the blob and email adapters. A
// production adapter (Azure AI Document Intelligence) and a local fallback
// implement the same interface; development and tests always use the local
// one and never require Azure.
//
// Extraction output is advisory by contract: every field is an optional
// suggestion the employee confirms or edits, and nothing is written to a
// claim without that confirmation. Unreadable or unrecognized receipts
// yield an empty suggestion object, never an error the caller must handle
// to keep the flow usable.

export type ReceiptSuggestion = {
  // The suggested total in minor units (paise), matching the claim's
  // amountMinor representation.
  amountMinor?: number;
  // The suggested transaction date as YYYY-MM-DD, matching the draft form's
  // date input format.
  date?: string;
  // The suggested merchant name, applied to the draft's title field.
  vendor?: string;
  // A best-effort category from the app's category catalog. It is always
  // presented as a guess: category drives policy behavior, so a wrong guess
  // must never create a wrong approval.
  categoryGuess?: string;
};

export interface ReceiptExtractor {
  extract(data: Uint8Array): Promise<ReceiptSuggestion>;
}
