import { describe, expect, it } from "vitest";
import { firstPdfAttachment, hasAvailableAttachment, hasAvailablePdf } from "./has-available-pdf";

describe("firstPdfAttachment", () => {
  it("returns the first pdf name in a mixed list", () => {
    expect(firstPdfAttachment(["scan-1.jpg", "draft-receipt.pdf", "quote-2026.pdf"])).toBe(
      "draft-receipt.pdf",
    );
  });

  it("returns undefined when no attachment is a pdf", () => {
    expect(firstPdfAttachment(["pantry-receipt.jpg", "taxi-receipt.png"])).toBeUndefined();
  });

  it("matches .PDF case-insensitively", () => {
    expect(firstPdfAttachment(["DRAFT-RECEIPT.PDF"])).toBe("DRAFT-RECEIPT.PDF");
    expect(firstPdfAttachment(["draft-receipt.Pdf"])).toBe("draft-receipt.Pdf");
  });

  it("returns undefined for an empty list", () => {
    expect(firstPdfAttachment([])).toBeUndefined();
  });
});

describe("hasAvailableAttachment", () => {
  it("is true when receipt bytes are available or unknown", () => {
    expect(hasAvailableAttachment(true)).toBe(true);
    expect(hasAvailableAttachment(undefined)).toBe(true);
  });

  it("is false when receipt bytes are explicitly missing", () => {
    expect(hasAvailableAttachment(false)).toBe(false);
  });
});

describe("hasAvailablePdf", () => {
  it("is true for a pdf attachment with the receipt available", () => {
    expect(hasAvailablePdf(["draft-receipt.pdf"], true)).toBe(true);
    expect(hasAvailablePdf(["invoice-figma-2026-08.pdf", "quote-2026.pdf"])).toBe(true);
  });

  it("is false for non-pdf attachment names", () => {
    expect(hasAvailablePdf(["receipt-acme-dinner.jpg"], true)).toBe(false);
    expect(hasAvailablePdf(["pantry-receipt.jpg", "taxi-receipt.png"], true)).toBe(false);
  });

  it("treats a missing attachmentAvailable as available", () => {
    expect(hasAvailablePdf(["boarding-pass.pdf"], undefined)).toBe(true);
  });

  it("is false when attachmentAvailable is explicitly false", () => {
    expect(hasAvailablePdf(["draft-receipt.pdf"], false)).toBe(false);
    expect(hasAvailablePdf(["boarding-pass.pdf", "quote-2026.pdf"], false)).toBe(false);
  });

  it("is true for a mixed list that contains a pdf", () => {
    expect(hasAvailablePdf(["scan-1.jpg", "draft-receipt.pdf"], true)).toBe(true);
  });

  it("matches .PDF case-insensitively", () => {
    expect(hasAvailablePdf(["DRAFT-RECEIPT.PDF"], true)).toBe(true);
    expect(hasAvailablePdf(["draft-receipt.Pdf"], true)).toBe(true);
  });

  it("is false for an empty attachment list", () => {
    expect(hasAvailablePdf([])).toBe(false);
  });

  it("is false when the receipt bytes are missing regardless of the attachment name", () => {
    expect(hasAvailablePdf(["hotel-invoice.pdf"], false)).toBe(false);
  });
});
