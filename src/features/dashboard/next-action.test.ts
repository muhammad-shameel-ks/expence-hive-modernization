import { describe, expect, it } from "vitest";
import { ME, type Expense } from "./mock-data";
import { isTerminal, nextActionFor } from "./next-action";

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "ex-test",
    ref: "EXP-TEST",
    title: "Test expense",
    category: "Other",
    amount: 100,
    currency: "USD",
    date: "Aug 4",
    submittedAt: "2026-08-04T09:00:00Z",
    status: "submitted",
    attachments: [],
    history: [],
    ...overrides,
  };
}

describe("nextActionFor", () => {
  it("returns Continue draft for a draft, owned by me", () => {
    expect(nextActionFor(expense({ status: "draft" }))).toEqual({
      label: "Continue draft",
      actor: ME,
      mine: true,
    });
  });

  it("returns Resubmit for needs-correction, owned by me", () => {
    expect(nextActionFor(expense({ status: "needs-correction" }))).toEqual({
      label: "Resubmit",
      actor: ME,
      mine: true,
    });
  });

  it("sends a rejected expense back into the correction loop, owned by me", () => {
    expect(nextActionFor(expense({ status: "rejected" }))).toEqual({
      label: "Resubmit",
      actor: ME,
      mine: true,
    });
  });

  it("points at the assigned approver for submitted and in-approval", () => {
    const submitted = expense({ status: "submitted", nextStage: "IT Head review", nextActor: "IT Head" });
    expect(nextActionFor(submitted)).toEqual({
      label: "IT Head review",
      actor: "IT Head",
      mine: false,
    });

    const inApproval = expense({ status: "in-approval", nextStage: "Team Lead approval", nextActor: "Ada Lovelace" });
    expect(nextActionFor(inApproval)).toEqual({ label: "Team Lead approval", actor: "Ada Lovelace", mine: false });
  });

  it("falls back to a generic Approval label when no stage is assigned", () => {
    expect(nextActionFor(expense({ status: "submitted" }))).toEqual({
      label: "Approval",
      actor: undefined,
      mine: false,
    });
  });

  it("points at Finance verification for approved and in-finance", () => {
    expect(nextActionFor(expense({ status: "approved", nextActor: "Finance Officer" }))).toEqual({
      label: "Finance verification",
      actor: "Finance Officer",
      mine: false,
    });
    expect(nextActionFor(expense({ status: "in-finance", nextActor: "Finance Officer" }))).toEqual({
      label: "Finance verification",
      actor: "Finance Officer",
      mine: false,
    });
  });

  it("is Done for a paid expense, owned by no one", () => {
    expect(nextActionFor(expense({ status: "paid" }))).toEqual({ label: "Done", mine: false });
  });

  it("honours an explicit current user instead of the mock identity", () => {
    const result = nextActionFor(expense({ status: "needs-correction" }), "Ada Lovelace");
    expect(result.actor).toBe("Ada Lovelace");
  });
});

describe("isTerminal", () => {
  it("is true only for paid expenses", () => {
    expect(isTerminal("paid")).toBe(true);
  });

  it("is false for every status that can still move, including rejected", () => {
    for (const status of [
      "draft",
      "submitted",
      "in-approval",
      "needs-correction",
      "approved",
      "in-finance",
      "rejected",
    ] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});
