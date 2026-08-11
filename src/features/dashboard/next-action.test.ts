import { describe, expect, it } from "vitest";
import { ME, type Expense } from "./mock-data";
import { canTakeOver, isTerminal, isTerminalPoolEligible, nextActionFor } from "./next-action";

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

  it("marks finance verification as mine for any holder of the terminal step's role, not just the assigned actor", () => {
    const inFinance = expense({
      status: "in-finance",
      requesterId: "emp-requester",
      nextActor: "Rishikesh",
      nextActorId: "emp-finance-1",
      steps: [
        {
          id: "s-1",
          roleId: "role-finance-executive",
          roleName: "Finance Executive",
          status: "pending",
        },
      ],
    });
    // The assigned actor is eligible.
    expect(nextActionFor(inFinance, "Rishikesh", "emp-finance-1", "role-finance-executive").mine).toBe(true);
    // A different active holder of the same role is also eligible (pool).
    expect(nextActionFor(inFinance, "Rishikesh 2", "emp-finance-2", "role-finance-executive").mine).toBe(true);
    // A viewer holding a different role is not.
    expect(nextActionFor(inFinance, "Pramod", "emp-pramod", "role-finance-head").mine).toBe(false);
    // Without a role id the gate falls back to strict assignment.
    expect(nextActionFor(inFinance, "Rishikesh 2", "emp-finance-2").mine).toBe(false);
  });

  it("does not let the requester verify or pay their own claim even when they hold the terminal role", () => {
    const inFinance = expense({
      status: "in-finance",
      requesterId: "emp-finance",
      nextActorId: "emp-finance-2",
      steps: [
        {
          id: "s-1",
          roleId: "role-finance-executive",
          roleName: "Finance Executive",
          status: "pending",
        },
      ],
    });
    expect(nextActionFor(inFinance, "Rishikesh", "emp-finance", "role-finance-executive").mine).toBe(false);
  });
});

describe("isTerminalPoolEligible", () => {
  const base = {
    requesterId: "emp-requester",
    steps: [{ roleId: "role-finance-executive", status: "pending" }],
  } as const;

  it("is true for a holder of the current step's role who is not the requester", () => {
    expect(isTerminalPoolEligible(base, "emp-finance", "role-finance-executive")).toBe(true);
  });

  it("is false without a viewer id or role id", () => {
    expect(isTerminalPoolEligible(base)).toBe(false);
    expect(isTerminalPoolEligible(base, "emp-finance")).toBe(false);
    expect(isTerminalPoolEligible(base, undefined, "role-finance-executive")).toBe(false);
  });

  it("is false for the requester of the claim", () => {
    expect(isTerminalPoolEligible(base, "emp-requester", "role-finance-executive")).toBe(false);
  });

  it("is false when the viewer holds a different role than the current step", () => {
    expect(isTerminalPoolEligible(base, "emp-pramod", "role-finance-head")).toBe(false);
  });

  it("is false when the current step is a team-lead step (no role id)", () => {
    expect(isTerminalPoolEligible({ ...base, steps: [{ roleId: null, status: "pending" }] }, "emp-finance", "role-finance-executive")).toBe(false);
  });

  it("is false when no step is waiting on an actor", () => {
    expect(isTerminalPoolEligible({ requesterId: "emp-requester", steps: [{ roleId: "role-finance-executive", status: "approved" }] }, "emp-finance", "role-finance-executive")).toBe(false);
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

describe("canTakeOver", () => {
  const claimInApproval = {
    status: "in-approval",
    requesterId: "emp-shameel",
    nextActorId: "emp-sanil",
    steps: [
      { roleId: "role-manager", status: "pending" },
      { roleId: "role-finance-head", status: "pending" },
    ],
  };

  it("returns true for Finance Head on an in-approval claim", () => {
    expect(canTakeOver(claimInApproval, "emp-pramod", "finance-head", "role-finance-head")).toBe(true);
  });

  it("returns true for a later-stage role matching step", () => {
    expect(canTakeOver(claimInApproval, "emp-other-head", "custom-head-role", "role-finance-head")).toBe(true);
  });

  it("returns false for the claim requester", () => {
    expect(canTakeOver(claimInApproval, "emp-shameel", "finance-head", "role-finance-head")).toBe(false);
  });

  it("returns false for the active current actor", () => {
    expect(canTakeOver(claimInApproval, "emp-sanil", "manager", "role-manager")).toBe(false);
  });

  it("returns false for terminal claims", () => {
    expect(canTakeOver({ ...claimInApproval, status: "paid" }, "emp-pramod", "finance-head", "role-finance-head")).toBe(false);
  });

  it("does not offer a positional takeover onto an amount-guard auto-skipped step", () => {
    const claim = {
      ...claimInApproval,
      steps: [
        { roleId: "role-manager", status: "pending" },
        { roleId: "role-finance-executive", status: "skipped" },
      ],
    };
    // The Finance Executive's only later step was auto-skipped by an
    // amount guard: no pending later step targets the role, so the
    // positional takeover must not be offered (mirrors the server).
    expect(canTakeOver(claim, "emp-finance", "finance-executive", "role-finance-executive")).toBe(false);
  });

  it("still offers the apex takeover when the actor's own later step was auto-skipped", () => {
    const claim = {
      ...claimInApproval,
      steps: [
        { roleId: "role-manager", status: "pending" },
        { roleId: "role-finance-head", status: "skipped" },
      ],
    };
    expect(canTakeOver(claim, "emp-pramod", "finance-head", "role-finance-head")).toBe(true);
  });
});
