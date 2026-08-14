import type { ReceiptExtractor, ReceiptSuggestion } from "./ports";
import { extractCategoryGuess } from "./heuristics";

// The production adapter (ADR-0025): Azure AI Document Intelligence,
// prebuilt receipt model, selected by configuration and never used by local
// development or tests (see compose.ts). It talks to the Document
// Intelligence REST API directly with fetch - the same API the official SDK
// wraps - so the adapter adds no new dependency and its response parsing is
// unit-testable with fixture JSON.
//
// Flow: POST the PDF to the prebuilt-receipt analyze endpoint, poll the
// operation-location URL until the analysis succeeds, then map the receipt
// fields document to the suggestion shape. Field mapping is deliberately
// narrow (total, transaction date, merchant name); the category guess reuses
// the same keyword heuristic as the local adapter so both adapters agree.

const API_VERSION = "2024-11-30";
const MAX_POLL_ATTEMPTS = 20;
const MAX_RETRY_AFTER_SECONDS = 5;
const FALLBACK_POLL_DELAY_MS = 1500;

type AnalyzeField = {
  type?: string;
  valueString?: string;
  valueNumber?: number;
  valueDate?: string;
  valueCurrency?: { amount?: number };
  content?: string;
};

type AnalyzeDocument = {
  fields?: Record<string, AnalyzeField>;
};

type AnalyzeOperationResult = {
  status?: string;
  analyzeResult?: {
    content?: string;
    documents?: AnalyzeDocument[];
  };
  error?: { message?: string };
};

type AzureExtractorOptions = {
  // Injected for tests; production uses the global fetch.
  fetchImpl?: typeof fetch;
  // Injectable clock for the poll sleep, mirroring the repo's `now` seams.
  sleep?: (ms: number) => Promise<void>;
};

export class AzureDocumentIntelligenceExtractor implements ReceiptExtractor {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    options: AzureExtractorOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async extract(data: Uint8Array): Promise<ReceiptSuggestion> {
    const result = await this.analyze(data);
    return mapAnalyzeResult(result);
  }

  private async analyze(data: Uint8Array): Promise<AnalyzeOperationResult> {
    const analyzeUrl = new URL(
      `documentmodels/prebuilt-receipt:analyze?api-version=${API_VERSION}`,
      this.endpoint,
    ).toString();
    const analyzeResponse = await this.fetchImpl(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": "application/pdf",
      },
      // fetch's BodyInit requires an ArrayBuffer-backed view; the copy keeps
      // the adapter's own contract byte-agnostic.
      body: new Uint8Array(data),
    });
    if (!analyzeResponse.ok) {
      throw new Error(`Azure Document Intelligence analyze request failed: ${analyzeResponse.status}`);
    }
    const operationLocation = analyzeResponse.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Azure Document Intelligence analyze response carried no operation location.");
    }
    return this.poll(operationLocation);
  }

  private async poll(operationLocation: string): Promise<AnalyzeOperationResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const response = await this.fetchImpl(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
      });
      if (!response.ok) {
        throw new Error(`Azure Document Intelligence poll request failed: ${response.status}`);
      }
      const result = (await response.json()) as AnalyzeOperationResult;
      if (result.status === "succeeded") return result;
      if (result.status === "failed") {
        throw new Error(
          `Azure Document Intelligence analysis failed: ${result.error?.message ?? "unknown error"}`,
        );
      }
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds, MAX_RETRY_AFTER_SECONDS) * 1000
          : FALLBACK_POLL_DELAY_MS;
      await this.sleep(delayMs);
    }
    throw new Error("Azure Document Intelligence analysis timed out.");
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Maps the analyze result's receipt fields document to the suggestion shape.
// Absent or malformed fields are simply omitted; the category guess runs on
// every text the service returned so the two adapters share one heuristic.
export function mapAnalyzeResult(result: AnalyzeOperationResult): ReceiptSuggestion {
  const suggestion: ReceiptSuggestion = {};
  const document = result.analyzeResult?.documents?.[0];
  const fields = document?.fields ?? {};

  const total = pick(fields, "Total");
  if (total !== undefined) {
    const amount = total.valueCurrency?.amount ?? total.valueNumber;
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      suggestion.amountMinor = Math.round(amount * 100);
    }
  }

  const date = pick(fields, "TransactionDate");
  if (typeof date?.valueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.valueDate)) {
    suggestion.date = date.valueDate;
  }

  const merchant = pick(fields, "MerchantName");
  const vendor = merchant?.valueString?.trim();
  if (vendor !== undefined && vendor.length > 0 && vendor.length <= 80) {
    suggestion.vendor = vendor;
  }

  const categoryGuess = extractCategoryGuess(result.analyzeResult?.content ?? "");
  if (categoryGuess !== undefined) suggestion.categoryGuess = categoryGuess;

  return suggestion;
}

function pick(fields: Record<string, AnalyzeField>, name: string): AnalyzeField | undefined {
  return fields[name] ?? fields[name.toLowerCase()] ?? fields[name.toUpperCase()];
}
