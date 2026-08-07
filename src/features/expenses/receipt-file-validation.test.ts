import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_SIZE_BYTES, receiptValidationError } from "./receipt-file-validation";

function receiptFile(overrides: Partial<File> = {}): File {
  return new File([new Uint8Array(64)], "receipt.pdf", { type: "application/pdf", ...overrides });
}

describe("receiptValidationError", () => {
  it("returns null for a small image/jpeg file", () => {
    expect(receiptValidationError(receiptFile({ type: "image/jpeg" }))).toBeNull();
  });

  it("returns null for a small image/png file", () => {
    expect(receiptValidationError(receiptFile({ type: "image/png" }))).toBeNull();
  });

  it("returns null for a small application/pdf file", () => {
    expect(receiptValidationError(receiptFile())).toBeNull();
  });

  it("rejects image/heic with the type message", () => {
    expect(receiptValidationError(receiptFile({ type: "image/heic" }))).toBe(
      "Receipts must be a JPEG, PNG, or PDF file.",
    );
  });

  it("rejects image/webp with the type message", () => {
    expect(receiptValidationError(receiptFile({ type: "image/webp" }))).toBe(
      "Receipts must be a JPEG, PNG, or PDF file.",
    );
  });

  it("rejects video/mp4 with the type message", () => {
    expect(receiptValidationError(receiptFile({ type: "video/mp4" }))).toBe(
      "Receipts must be a JPEG, PNG, or PDF file.",
    );
  });

  it("allows application/octet-stream (the wire form of an absent declaration; the server sniffs)", () => {
    expect(receiptValidationError(receiptFile({ type: "application/octet-stream" }))).toBeNull();
  });

  it("allows an empty type (the server sniffs magic bytes and is authoritative)", () => {
    expect(receiptValidationError(receiptFile({ type: "" }))).toBeNull();
  });

  it("rejects files larger than 10 MB with the size message", () => {
    const oversized = new File([new Uint8Array(MAX_RECEIPT_SIZE_BYTES + 1)], "big.pdf", {
      type: "application/pdf",
    });
    expect(receiptValidationError(oversized)).toBe("The receipt is larger than 10 MB.");
  });

  it("accepts a file exactly at the 10 MB cap", () => {
    const atCap = new File([new Uint8Array(MAX_RECEIPT_SIZE_BYTES)], "big.pdf", {
      type: "application/pdf",
    });
    expect(receiptValidationError(atCap)).toBeNull();
  });
});
