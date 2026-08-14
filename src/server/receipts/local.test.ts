import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { LocalPdfReceiptExtractor } from "./local";
import type { ReceiptSuggestion } from "./ports";

// Contract tests for the extraction port against the local fallback
// (ADR-0025), mirroring the blob and email adapter contract tests. The
// fixture PDFs are generated with pdf-lib (already a dependency) so the
// text layer is real: an unreadable document must never throw, and a
// readable receipt must produce the same deterministic suggestions.

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

describe("LocalPdfReceiptExtractor (contract)", () => {
  const extractor = new LocalPdfReceiptExtractor();

  it("extracts amount, date, vendor, and category from a conventional receipt PDF", async () => {
    const pdf = await receiptPdf([
      "Green Leaf Cafe",
      "MG Road, Bengaluru",
      "Date: 2026-08-10",
      "Cappuccino Rs. 150.00",
      "Sandwich Rs. 220.00",
      "Grand Total Rs. 370.00",
      "Thank you!",
    ]);

    const suggestions = await extractor.extract(new Uint8Array(pdf));

    expect(suggestions).toEqual<ReceiptSuggestion>({
      amountMinor: 37000,
      date: "2026-08-10",
      vendor: "Green Leaf Cafe",
      categoryGuess: "Meals",
    });
  });

  it("extracts amount and date from a dense single-line text layer", async () => {
    const pdf = await receiptPdf([
      "Uber India Pvt Ltd Date: 14/08/2026 Total: Rs. 412.50 Payment via UPI",
    ]);

    const suggestions = await extractor.extract(new Uint8Array(pdf));

    expect(suggestions.amountMinor).toBe(41250);
    expect(suggestions.date).toBe("2026-08-14");
    // A dense one-line text layer has no separable vendor line; the line
    // heuristics deliberately skip it rather than guess.
    expect(suggestions.vendor).toBeUndefined();
  });

  it("returns an empty suggestion object for an unreadable PDF", async () => {
    const corrupt = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0xfe]); // "%PDF-" then garbage

    const suggestions = await extractor.extract(corrupt);

    expect(suggestions).toEqual({});
  });

  it("returns an empty suggestion object for a PDF with no text layer", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 600]);
    const pdf = await doc.save();

    const suggestions = await extractor.extract(new Uint8Array(pdf));

    expect(suggestions).toEqual({});
  });

  it("returns partial suggestions when only some fields are readable", async () => {
    const pdf = await receiptPdf([
      "Air India",
      "Date: 10-08-2026",
      "Baggage fee Rs. 900.00",
    ]);

    const suggestions = await extractor.extract(new Uint8Array(pdf));

    expect(suggestions.amountMinor).toBe(90000);
    expect(suggestions.date).toBe("2026-08-10");
    expect(suggestions.vendor).toBe("Air India");
    expect(suggestions.categoryGuess).toBe("Travel");
  });
});
