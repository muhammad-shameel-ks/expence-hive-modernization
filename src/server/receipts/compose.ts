import { AzureDocumentIntelligenceExtractor } from "./azure";
import { LocalPdfReceiptExtractor } from "./local";
import type { ReceiptExtractor } from "./ports";

// The composition seam (ADR-0025), mirroring the blob and email adapters
// (ADR-0004): Azure Document Intelligence configuration selects the
// production adapter, local development falls back to the deterministic
// pdf.js extractor, and production fails loudly when the configuration is
// missing. Local development and tests never require Azure.
export function createReceiptExtractor(env = process.env): ReceiptExtractor {
  const endpoint = env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  if (endpoint && apiKey) {
    return new AzureDocumentIntelligenceExtractor(endpoint, apiKey);
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY must be set in production.",
    );
  }
  return new LocalPdfReceiptExtractor();
}
