import { describe, expect, it } from "vitest";
import type { ExpenseClaim } from "@/server/expenses/ports";
import { hasReceiptAttachment, selectedClaimFor, stepSelection } from "./payment-queue-selection";

function claim(overrides: Partial<ExpenseClaim>): ExpenseClaim {
  return {
    id: "claim-test",
    ref: "EXP-TEST",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Test claim",
    category: "Other",
    subCategory: "Other",
    remark: "Test remark",
    amountMinor: 10000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "in-finance",
    currentStage: "finance",
    payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    steps: [],
    history: [],
    version: 1,
    createdAt: "2026-08-04T09:00:00Z",
    submittedAt: "2026-08-04T09:00:00Z",
    ...overrides,
  };
}

describe("hasReceiptAttachment", () => {
  it("is true only when the claim carries a real content digest", () => {
    const withReceipt = claim({
      attachment: {
        id: "att-1",
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        storageKey: "receipts/att-1",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 1024,
        uploadedAt: "2026-08-04T09:00:00Z",
      },
    });
    expect(hasReceiptAttachment(withReceipt)).toBe(true);
  });

  it("is false when there is no attachment at all", () => {
    expect(hasReceiptAttachment(claim({ attachment: undefined }))).toBe(false);
  });

  it("is false for legacy placeholder rows with an empty digest", () => {
    const placeholder = claim({
      attachment: {
        id: "att-placeholder",
        fileName: "",
        contentType: "application/pdf",
        storageKey: "receipts/att-placeholder",
        status: "available",
        contentSha256: "",
        sizeBytes: 0,
        uploadedAt: "2026-08-04T09:00:00Z",
      },
    });
    expect(hasReceiptAttachment(placeholder)).toBe(false);
  });
});

describe("selectedClaimFor", () => {
  it("finds a claim by id", () => {
    const list = [claim({ id: "a" }), claim({ id: "b" })];
    expect(selectedClaimFor(list, "b")?.id).toBe("b");
  });

  it("returns undefined for a null selection", () => {
    expect(selectedClaimFor([claim({ id: "a" })], null)).toBeUndefined();
  });

  it("returns undefined when the id is not in the list", () => {
    expect(selectedClaimFor([claim({ id: "a" })], "missing")).toBeUndefined();
  });
});

describe("stepSelection", () => {
  const rows = [claim({ id: "first" }), claim({ id: "second" }), claim({ id: "third" })];

  it("moves forward through the rows", () => {
    expect(stepSelection(rows, "first", 1)).toBe("second");
  });

  it("moves backward through the rows", () => {
    expect(stepSelection(rows, "second", -1)).toBe("first");
  });

  it("clamps at the first row when moving up", () => {
    expect(stepSelection(rows, "first", -1)).toBe("first");
  });

  it("clamps at the last row when moving down", () => {
    expect(stepSelection(rows, "third", 1)).toBe("third");
  });

  it("starts at the first row when nothing is selected", () => {
    expect(stepSelection(rows, null, 1)).toBe("first");
  });

  it("starts at the last row when moving up with no selection", () => {
    expect(stepSelection(rows, null, -1)).toBe("third");
  });

  it("restarts from an edge when the current row is no longer in the list", () => {
    expect(stepSelection([rows[1], rows[2]], "first", 1)).toBe("second");
    expect(stepSelection([rows[0], rows[1]], "third", -1)).toBe("second");
  });

  it("returns null for an empty row list", () => {
    expect(stepSelection([], "first", 1)).toBeNull();
    expect(stepSelection([], null, -1)).toBeNull();
  });
});
