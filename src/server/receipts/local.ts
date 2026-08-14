import type { ReceiptExtractor, ReceiptSuggestion } from "./ports";
import { extractPdfTextLayer } from "./pdf-text";
import { suggestFromText } from "./heuristics";

// The local fallback adapter (ADR-0025): reads the PDF text layer and runs
// the deterministic heuristics. It needs no Azure, no network, and no extra
// dependencies, and it is deterministic for tests. An unreadable or
// text-less PDF yields an empty suggestion object, keeping the flow usable
// without OCR.
export class LocalPdfReceiptExtractor implements ReceiptExtractor {
  async extract(data: Uint8Array): Promise<ReceiptSuggestion> {
    const text = await extractPdfTextLayer(data);
    if (text === null) return {};
    return suggestFromText(text);
  }
}
