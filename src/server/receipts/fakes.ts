import type { ReceiptExtractor, ReceiptSuggestion } from "./ports";

// A scriptable extractor for tests and local wiring: returns a fixed
// suggestion or an optional thrown error, mirroring the auth/blob fake
// adapters.
export class FakeReceiptExtractor implements ReceiptExtractor {
  constructor(
    private readonly suggestion: ReceiptSuggestion,
    private readonly failure?: Error,
  ) {}

  async extract(): Promise<ReceiptSuggestion> {
    if (this.failure) throw this.failure;
    return this.suggestion;
  }
}
