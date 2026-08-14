import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeReceiptExtractor } from "./fakes";
import { handleExtractReceiptRequest } from "./http";
import { MAX_RECEIPT_SIZE_BYTES } from "../expenses/receipt-validation";

// Route handler tests for the extraction API (ADR-0025): format authority,
// size limits, the success shape, and the never-block-the-flow failure
// behavior. Authorization (session) lives in the route file and is covered
// by the route test.

async function receiptPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 560;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 20;
  }
  return doc.save();
}

function extractRequest(file?: { name: string; type: string; data: Uint8Array }): Request {
  const form = new FormData();
  if (file) form.set("receipt", new File([file.data as BlobPart], file.name, { type: file.type }));
  return new Request("http://localhost/api/receipts/extract", { method: "POST", body: form });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleExtractReceiptRequest", () => {
  it("returns the suggestions for a fixture PDF receipt", async () => {
    const pdf = await receiptPdf([
      "Green Leaf Cafe",
      "Date: 2026-08-10",
      "Grand Total Rs. 370.00",
    ]);
    const response = await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.pdf", type: "application/pdf", data: new Uint8Array(pdf) }),
      new FakeReceiptExtractor({ amountMinor: 37000, date: "2026-08-10", vendor: "Green Leaf Cafe", categoryGuess: "Meals" }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { suggestions: unknown };
    expect(payload.suggestions).toEqual({
      amountMinor: 37000,
      date: "2026-08-10",
      vendor: "Green Leaf Cafe",
      categoryGuess: "Meals",
    });
  });

  it("returns empty suggestions for an unreadable receipt through the local adapter", async () => {
    const corrupt = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0xfe]);
    const response = await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.pdf", type: "application/pdf", data: corrupt }),
      new FakeReceiptExtractor({}),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { suggestions: unknown };
    expect(payload.suggestions).toEqual({});
  });

  it("rejects a request without a receipt part", async () => {
    const response = await handleExtractReceiptRequest(
      extractRequest(),
      new FakeReceiptExtractor({}),
    );

    expect(response.status).toBe(422);
  });

  it("rejects non-PDF content regardless of the declared type", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const response = await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.jpg", type: "image/jpeg", data: jpeg }),
      new FakeReceiptExtractor({}),
    );

    expect(response.status).toBe(422);
    const payload = (await response.json()) as { message: string };
    expect(payload.message).toBe("Receipts must be a PDF file.");
  });

  it("rejects non-PDF bytes that pretend to be a PDF", async () => {
    const spoofed = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const response = await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.pdf", type: "application/pdf", data: spoofed }),
      new FakeReceiptExtractor({}),
    );

    expect(response.status).toBe(422);
  });

  it("rejects oversized bodies before parsing", async () => {
    const oversized = new Uint8Array(MAX_RECEIPT_SIZE_BYTES + 1024);
    oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0); // "%PDF-" magic
    const form = new FormData();
    form.set("receipt", new File([oversized], "big.pdf", { type: "application/pdf" }));
    const request = new Request("http://localhost/api/receipts/extract", { method: "POST", body: form });

    const response = await handleExtractReceiptRequest(request, new FakeReceiptExtractor({}));

    expect(response.status).toBe(413);
  });

  it("returns empty suggestions with a message when the provider fails", async () => {
    const pdf = await receiptPdf(["Acme Corp", "Total: Rs. 100.00"]);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.pdf", type: "application/pdf", data: new Uint8Array(pdf) }),
      new FakeReceiptExtractor({}, new Error("provider outage")),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { suggestions: unknown; message: string };
    expect(payload.suggestions).toEqual({});
    expect(payload.message).toContain("We could not read this receipt right now.");
    expect(error).toHaveBeenCalled();
  });

  it("never calls the extractor for a rejected payload", async () => {
    const extractor = new FakeReceiptExtractor({ amountMinor: 1 });
    const spy = vi.spyOn(extractor, "extract");
    await handleExtractReceiptRequest(
      extractRequest({ name: "receipt.png", type: "image/png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }),
      extractor,
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
