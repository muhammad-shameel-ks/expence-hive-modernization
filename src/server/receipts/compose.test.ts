import { afterEach, describe, expect, it, vi } from "vitest";
import { AzureDocumentIntelligenceExtractor } from "./azure";
import { createReceiptExtractor } from "./compose";
import { LocalPdfReceiptExtractor } from "./local";

describe("createReceiptExtractor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an Azure extractor when endpoint and key are configured", () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "https://example.cognitiveservices.azure.com/");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_KEY", "secret");
    vi.stubEnv("NODE_ENV", "production");

    const extractor = createReceiptExtractor();

    expect(extractor).toBeInstanceOf(AzureDocumentIntelligenceExtractor);
  });

  it("returns the local extractor in development without Azure configuration", () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    const extractor = createReceiptExtractor();

    expect(extractor).toBeInstanceOf(LocalPdfReceiptExtractor);
  });

  it("returns the local extractor in tests without Azure configuration", () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_KEY", "");

    const extractor = createReceiptExtractor();

    expect(extractor).toBeInstanceOf(LocalPdfReceiptExtractor);
  });

  it("throws in production when Azure configuration is missing", () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createReceiptExtractor()).toThrow(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY must be set in production.",
    );
  });

  it("throws in production when only the endpoint is configured", () => {
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "https://example.cognitiveservices.azure.com/");
    vi.stubEnv("AZURE_DOCUMENT_INTELLIGENCE_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => createReceiptExtractor()).toThrow();
  });
});
