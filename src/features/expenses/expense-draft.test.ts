import { describe, expect, it } from "vitest";
import type { ExpenseClaim } from "@/server/expenses/ports";
import { draftAttachmentFileName } from "./expense-draft";

function draftClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 24000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "draft",
    steps: [],
    history: [],
    version: 1,
    createdAt: "2026-08-04T09:00:00.000Z",
    ...overrides,
  };
}

describe("draftAttachmentFileName", () => {
  it("returns the file name when the attachment has a non-empty contentSha256", () => {
    const claim = draftClaim({
      attachment: {
        id: "attachment-1",
        fileName: "receipt.jpg",
        contentType: "image/jpeg",
        storageKey: "org-1/claim-1/attachment-1.jpg",
        status: "available",
        contentSha256: "abc123",
        sizeBytes: 10,
        uploadedAt: "2026-08-04T10:00:00.000Z",
      },
    });

    expect(draftAttachmentFileName(claim)).toBe("receipt.jpg");
  });

  it("returns undefined when the claim has no attachment", () => {
    expect(draftAttachmentFileName(draftClaim())).toBeUndefined();
  });

  it("returns undefined when the attachment has an empty contentSha256 (legacy placeholder)", () => {
    const claim = draftClaim({
      attachment: {
        id: "attachment-1",
        fileName: "legacy-receipt.jpg",
        contentType: "image/jpeg",
        storageKey: "org-1/claim-1/attachment-1.jpg",
        status: "available",
        contentSha256: "",
        sizeBytes: 0,
        uploadedAt: "2026-08-04T10:00:00.000Z",
      },
    });

    expect(draftAttachmentFileName(claim)).toBeUndefined();
  });
});
