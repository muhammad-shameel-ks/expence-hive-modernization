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
    currency: "INR",
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
    expect(nextActionFor(expense({ status: "draft" }), ME)).toEqual({
      label: "Continue draft",
      actor: ME,
      mine: true,
    });
  });

  it("is terminal and unowned for a rejected expense", () => {
    expect(nextActionFor(expense({ status: "rejected" }), ME)).toEqual({
      label: "Submit a new claim",
      mine: false,
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

  it("marks an approval as mine when the current user is the assigned approver", () => {
    expect(nextActionFor(expense({ status: "in-approval", nextStage: "Manager approval", nextActor: "Ada Lovelace" }), "Ada Lovelace")).toEqual({
      label: "Manager approval",
      actor: "Ada Lovelace",
      mine: true,
    });
  });

  it("falls back to a generic Approval label when no stage is assigned", () => {
    expect(nextActionFor(expense({ status: "submitted" }), ME)).toEqual({
      label: "Approval",
      actor: undefined,
      mine: false,
    });
  });

  it("points at Finance verification for approved and in-finance", () => {
    expect(nextActionFor(expense({ status: "approved", nextActor: "Finance Officer" }), ME)).toEqual({
      label: "Finance verification",
      actor: "Finance Officer",
      mine: false,
    });
    expect(nextActionFor(expense({ status: "in-finance", nextActor: "Finance Officer" }), ME)).toEqual({
      label: "Finance verification",
      actor: "Finance Officer",
      mine: false,
    });
  });

  it("is Done for a paid expense, owned by no one", () => {
    expect(nextActionFor(expense({ status: "paid" }), ME)).toEqual({ label: "Done", mine: false });
  });

  it("honours an explicit current user instead of the mock identity", () => {
    const result = nextActionFor(expense({ status: "in-approval", nextActor: "Ada Lovelace" }), "Ada Lovelace");
    expect(result.actor).toBe("Ada Lovelace");
  });

  it("a rejected expense has no owner regardless of the current user", () => {
    const result = nextActionFor(expense({ status: "rejected" }), "Ada Lovelace");
    expect(result).toEqual({ label: "Submit a new claim", mine: false });
  });

  it("matches the assigned approver by id even when the current user's display name differs from the directory name", () => {
    // e.g. a dev-login label like "Sanil Davis / Manager (IT)" versus the
    // plain "Sanil Davis" the expense directory assigns as the actor's name.
    const assigned = expense({
      status: "in-approval",
      nextStage: "Manager approval",
      nextActor: "Sanil Davis",
      nextActorId: "emp-sanil",
    });
    expect(nextActionFor(assigned, "Sanil Davis / Manager (IT)", "emp-sanil")).toEqual({
      label: "Manager approval",
      actor: "Sanil Davis",
      mine: true,
    });
  });

  it("does not match by id when the assigned actor is someone else", () => {
    const assigned = expense({
      status: "in-approval",
      nextStage: "Manager approval",
      nextActor: "Sanil Davis",
      nextActorId: "emp-sanil",
    });
    expect(nextActionFor(assigned, "Ada Lovelace", "emp-ada").mine).toBe(false);
  });

  it("falls back to name matching when either side has no actor id", () => {
    const assigned = expense({ status: "in-approval", nextStage: "Manager approval", nextActor: "Ada Lovelace" });
    expect(nextActionFor(assigned, "Ada Lovelace", "emp-ada").mine).toBe(true);
  });
});

describe("isTerminal", () => {
  it("is true for paid and rejected expenses", () => {
    expect(isTerminal("paid")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
  });

  it("is false for every status that can still move", () => {
    for (const status of ["draft", "submitted", "in-approval", "approved", "in-finance"] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});
