import { describe, expect, it, vi } from "vitest";
import { AzureDocumentIntelligenceExtractor, mapAnalyzeResult } from "./azure";

// The Azure adapter (ADR-0025) is exercised against fixture REST responses
// with an injected fetch: the analyze/poll protocol and the fields mapping
// are deterministic and testable without an Azure resource. The adapter is
// never selected in local development or tests (compose.ts), so these tests
// only prove the adapter's own behavior.

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function analyzeOperation(status: "succeeded" | "failed" | "running", extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { status, ...extra };
}

function receiptFields(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Total: { type: "currency", valueCurrency: { amount: 1250.0 } },
    TransactionDate: { type: "date", valueDate: "2026-08-10" },
    MerchantName: { type: "string", valueString: "Acme Corp" },
    ...overrides,
  };
}

function succeededResult(fields = receiptFields()): Record<string, unknown> {
  return analyzeOperation("succeeded", {
    analyzeResult: {
      content: "Acme Corp\nDate: 2026-08-10\nGrand Total Rs. 1,250.00\nLunch for the team",
      documents: [{ fields }],
    },
  });
}

describe("AzureDocumentIntelligenceExtractor", () => {
  it("analyzes the PDF, polls the operation location, and returns mapped suggestions", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) {
        return new Response(null, {
          status: 202,
          headers: { "operation-location": "https://example/operations/op-1" },
        });
      }
      return jsonResponse(succeededResult());
    });
    const extractor = new AzureDocumentIntelligenceExtractor(
      "https://example.cognitiveservices.azure.com/",
      "secret",
      { fetchImpl, sleep: async () => {} },
    );

    const suggestions = await extractor.extract(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

    expect(suggestions).toEqual({
      amountMinor: 125000,
      date: "2026-08-10",
      vendor: "Acme Corp",
      categoryGuess: "Meals",
    });
    expect(requests[0].url).toContain("documentmodels/prebuilt-receipt:analyze");
    expect(requests[0].url).toContain("api-version=2024-11-30");
    expect(requests[0].init?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "secret",
      "Content-Type": "application/pdf",
    });
    expect(requests[0].init?.body).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    expect(requests[1].url).toBe("https://example/operations/op-1");
  });

  it("polls while the operation is still running and honors retry-after", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length === 1) {
        return new Response(null, { status: 202, headers: { "operation-location": "https://example/operations/op-1" } });
      }
      if (fetchImpl.mock.calls.length === 2) {
        return jsonResponse(analyzeOperation("running"), { headers: { "retry-after": "2" } });
      }
      return jsonResponse(succeededResult());
    });
    const extractor = new AzureDocumentIntelligenceExtractor("https://example/", "secret", {
      fetchImpl,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    const suggestions = await extractor.extract(new Uint8Array());

    expect(suggestions.amountMinor).toBe(125000);
    expect(sleeps).toEqual([2000]);
  });

  it("throws when the analyze request fails", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const extractor = new AzureDocumentIntelligenceExtractor("https://example/", "secret", {
      fetchImpl,
      sleep: async () => {},
    });

    await expect(extractor.extract(new Uint8Array())).rejects.toThrow(/analyze request failed: 401/);
  });

  it("throws when the operation fails", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 202, headers: { "operation-location": "https://example/operations/op-1" } });
      }
      return jsonResponse(analyzeOperation("failed", { error: { message: "model timeout" } }));
    });
    const extractor = new AzureDocumentIntelligenceExtractor("https://example/", "secret", {
      fetchImpl,
      sleep: async () => {},
    });

    await expect(extractor.extract(new Uint8Array())).rejects.toThrow(/analysis failed: model timeout/);
  });

  it("gives up after the poll budget and throws", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 202, headers: { "operation-location": "https://example/operations/op-1" } });
      }
      return jsonResponse(analyzeOperation("running"));
    });
    const extractor = new AzureDocumentIntelligenceExtractor("https://example/", "secret", {
      fetchImpl,
      sleep: async () => {},
    });

    await expect(extractor.extract(new Uint8Array())).rejects.toThrow(/timed out/);
  });
});

describe("mapAnalyzeResult", () => {
  it("maps a full fields document to the suggestion shape", () => {
    expect(mapAnalyzeResult(succeededResult() as never)).toEqual({
      amountMinor: 125000,
      date: "2026-08-10",
      vendor: "Acme Corp",
      categoryGuess: "Meals",
    });
  });

  it("converts a valueNumber total into minor units", () => {
    const result = succeededResult({ Total: { type: "number", valueNumber: 800.5 } });
    expect(mapAnalyzeResult(result as never).amountMinor).toBe(80050);
  });

  it("omits malformed or negative amounts", () => {
    const negative = succeededResult({ Total: { type: "currency", valueCurrency: { amount: -5 } } });
    expect(mapAnalyzeResult(negative as never).amountMinor).toBeUndefined();
    const missing = succeededResult({ Total: { type: "string" } });
    expect(mapAnalyzeResult(missing as never).amountMinor).toBeUndefined();
  });

  it("omits a malformed transaction date", () => {
    const result = succeededResult({ TransactionDate: { type: "date", valueDate: "not-a-date" } });
    expect(mapAnalyzeResult(result as never).date).toBeUndefined();
  });

  it("omits an empty merchant name", () => {
    const result = succeededResult({ MerchantName: { type: "string", valueString: "   " } });
    expect(mapAnalyzeResult(result as never).vendor).toBeUndefined();
  });

  it("returns an empty suggestion object when the service yields nothing", () => {
    expect(mapAnalyzeResult({ status: "succeeded", analyzeResult: {} } as never)).toEqual({});
    expect(mapAnalyzeResult({ status: "succeeded" } as never)).toEqual({});
  });
});
