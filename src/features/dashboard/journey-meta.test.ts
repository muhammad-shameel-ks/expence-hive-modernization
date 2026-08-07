import { describe, expect, it } from "vitest";
import { Clock } from "lucide-react";
import { formatMoney, submittedLabel, KIND_META } from "./journey-meta";
import { getJourneyFlowItems } from "./expense-drawer";

describe("formatMoney", () => {
  it("always shows two decimals for a consistent financial surface", () => {
    expect(formatMoney(594)).toBe("₹594.00");
    expect(formatMoney(594.6)).toBe("₹594.60");
    expect(formatMoney(100.25)).toBe("₹100.25");
  });

  it("respects the currency", () => {
    expect(formatMoney(340, "EUR")).toBe("€340.00");
  });
});

describe("submittedLabel", () => {
  it("renders the submission date from the ISO timestamp", () => {
    expect(submittedLabel("2026-08-03T10:42:00Z")).toBe("Aug 3");
    expect(submittedLabel("2026-07-29T13:20:00Z")).toBe("Jul 29");
  });

  it("falls back to the raw value instead of 'Invalid Date' for malformed input", () => {
    expect(submittedLabel("not-a-date")).toBe("not-a-date");
    expect(submittedLabel("")).toBe("");
  });
});

describe("getJourneyFlowItems", () => {
  it("renders full workflow with pending steps greyed out for in-progress claims", () => {
    const mockExpense = {
      id: "ex-1",
      ref: "EXP-1",
      title: "Test",
      category: "Software",
      amount: 100,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-03T10:00:00Z",
      status: "in-finance" as const,
      nextStage: "Finance verification",
      nextActor: "Finance Officer",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 3", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 3", actor: "Manager", kind: "approved" as const },
      ],
    };

    const steps = getJourneyFlowItems(mockExpense);
    expect(steps.length).toBe(4);
    expect(steps[0].pending).toBe(false);
    expect(steps[1].pending).toBe(false);
    expect(steps[2]).toMatchObject({
      id: "pending-verification",
      label: "Finance verification",
      pending: true,
    });
    expect(steps[3]).toMatchObject({
      id: "pending-payment",
      label: "Paid",
      pending: true,
    });
  });

  it("returns only history steps without pending steps for terminal paid expense", () => {
    const paidExpense = {
      id: "ex-paid",
      ref: "EXP-PAID",
      title: "Paid claim",
      category: "Travel",
      amount: 500,
      currency: "INR",
      date: "Aug 1",
      submittedAt: "2026-08-01T10:00:00Z",
      status: "paid" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 1", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 1", actor: "Manager", kind: "approved" as const },
        { id: "h3", date: "Aug 2", actor: "Finance", kind: "verified" as const },
        { id: "h4", date: "Aug 2", actor: "Finance", kind: "paid" as const },
      ],
    };

    const steps = getJourneyFlowItems(paidExpense);
    expect(steps.length).toBe(4);
    expect(steps.every((s) => !s.pending)).toBe(true);
  });

  it("includes pending approval step for multi-stage approval flows with earlier approvals", () => {
    const multiApprovalExpense = {
      id: "ex-flight",
      ref: "EXP-FLIGHT",
      title: "Flight ticket",
      category: "Travel",
      amount: 1200,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-04T10:00:00Z",
      status: "in-approval" as const,
      nextStage: "Team Lead approval",
      nextActor: "Grace Hopper",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 4", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 4", actor: "IT Head", kind: "approved" as const },
      ],
    };

    const steps = getJourneyFlowItems(multiApprovalExpense);
    const pendingApproval = steps.find((s) => s.id === "pending-approval");
    expect(pendingApproval).toBeDefined();
    expect(pendingApproval).toMatchObject({
      label: "Team Lead approval",
      actor: "Grace Hopper",
      pending: true,
    });
  });

  it("renders custom flow steps dynamically when expense.steps is present", () => {
    const customFlowExpense = {
      id: "ex-custom",
      ref: "EXP-CUSTOM",
      title: "Custom flow claim",
      category: "Software",
      amount: 2500,
      currency: "INR",
      date: "Aug 5",
      submittedAt: "2026-08-05T10:00:00Z",
      status: "in-approval" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 5", actor: "Shameel", kind: "submitted" as const },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Team Lead", assignedActorName: "Abilash", status: "pending" as const },
        { id: "s2", roleId: "r2", roleName: "Manager", assignedActorName: "Sanil Davis", status: "pending" as const },
        { id: "s3", roleId: "r3", roleName: "Finance Head", assignedActorName: "Pramod", status: "pending" as const },
        { id: "s4", roleId: "r4", roleName: "Finance reviewer", assignedActorName: "Rishikesh", status: "pending" as const },
      ],
    };

    const steps = getJourneyFlowItems(customFlowExpense);
    expect(steps.map((s) => s.label)).toEqual([
      "Submitted",
      "Team Lead",
      "Manager",
      "Finance Head",
      "Finance reviewer",
      "Paid",
    ]);
    expect(steps[1].actor).toBe("Abilash");
    expect(steps[2].actor).toBe("Sanil Davis");
    expect(steps[3].actor).toBe("Pramod");
    expect(steps[4].actor).toBe("Rishikesh");
  });

  it("marks only the last history event as current and the first pending step as next", () => {
    const customFlowExpense = {
      id: "ex-custom",
      ref: "EXP-CUSTOM",
      title: "Custom flow claim",
      category: "Software",
      amount: 2500,
      currency: "INR",
      date: "Aug 5",
      submittedAt: "2026-08-05T10:00:00Z",
      status: "in-approval" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 5", actor: "Shameel", kind: "submitted" as const },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Team Lead", assignedActorName: "Abilash", status: "pending" as const },
        { id: "s2", roleId: "r2", roleName: "Manager", assignedActorName: "Sanil Davis", status: "pending" as const },
      ],
    };

    const steps = getJourneyFlowItems(customFlowExpense);
    expect(steps[0]).toMatchObject({ isCurrent: true, isNext: false });
    expect(steps[1]).toMatchObject({ id: "pending-step-s1", isCurrent: false, isNext: true, pending: true });
    expect(steps[2]).toMatchObject({ id: "pending-step-s2", isCurrent: false, isNext: false, pending: true });
    expect(steps[3]).toMatchObject({ id: "pending-payment", isCurrent: false, isNext: false, pending: true });
    expect(steps.filter((s) => s.isCurrent).length).toBe(1);
    expect(steps.filter((s) => s.isNext).length).toBe(1);
  });

  it("marks the first synthetic pending step as next in the fallback branch", () => {
    const expense = {
      id: "ex-fallback",
      ref: "EXP-FALLBACK",
      title: "Fallback flow",
      category: "Travel",
      amount: 400,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-04T10:00:00Z",
      status: "in-finance" as const,
      nextStage: "Finance verification",
      nextActor: "Finance Officer",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 4", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 4", actor: "Manager", kind: "approved" as const },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    expect(steps[1]).toMatchObject({ isCurrent: true, isNext: false });
    expect(steps[2]).toMatchObject({ id: "pending-verification", isCurrent: false, isNext: true, pending: true });
    expect(steps[3]).toMatchObject({ id: "pending-payment", isCurrent: false, isNext: false, pending: true });
    expect(steps.filter((s) => s.isNext).length).toBe(1);
  });

  it("marks no step as current or next for terminal expenses", () => {
    const paidExpense = {
      id: "ex-paid",
      ref: "EXP-PAID",
      title: "Paid claim",
      category: "Travel",
      amount: 500,
      currency: "INR",
      date: "Aug 1",
      submittedAt: "2026-08-01T10:00:00Z",
      status: "paid" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 1", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 1", actor: "Manager", kind: "approved" as const },
        { id: "h3", date: "Aug 2", actor: "Finance", kind: "verified" as const },
        { id: "h4", date: "Aug 2", actor: "Finance", kind: "paid" as const },
      ],
    };

    const steps = getJourneyFlowItems(paidExpense);
    expect(steps.length).toBe(4);
    expect(steps.every((s) => !s.isCurrent && !s.isNext)).toBe(true);
  });

  it("marks a history entry as isMine by actor id even when the display name differs", () => {
    const expense = {
      id: "ex-mine",
      ref: "EXP-MINE",
      title: "Test",
      category: "Software",
      amount: 100,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-03T10:00:00Z",
      status: "in-finance" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 3", actor: "Shameel", actorId: "emp-shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 3", actor: "Sanil Davis", actorId: "emp-sanil", kind: "approved" as const },
      ],
    };

    const steps = getJourneyFlowItems(expense, "Sanil Davis / Manager (IT)", "emp-sanil");
    expect(steps[0].isMine).toBe(false);
    expect(steps[1].isMine).toBe(true);
  });

  it("falls back to name matching for isMine when no actor id is present", () => {
    const expense = {
      id: "ex-mine-2",
      ref: "EXP-MINE-2",
      title: "Test",
      category: "Software",
      amount: 100,
      currency: "INR",
      date: "Aug 4",
      submittedAt: "2026-08-03T10:00:00Z",
      status: "in-finance" as const,
      attachments: [],
      history: [{ id: "h1", date: "Aug 3", actor: "Ada Lovelace", kind: "approved" as const }],
    };

    expect(getJourneyFlowItems(expense, "Ada Lovelace")[0].isMine).toBe(true);
    expect(getJourneyFlowItems(expense, "Someone Else")[0].isMine).toBe(false);
  });

  it("uses a neutral clock icon for pending steps and completion icons only for completed history", () => {
    const expense = {
      id: "ex-icons",
      ref: "EXP-ICONS",
      title: "Icon check",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 5",
      submittedAt: "2026-08-05T10:00:00Z",
      status: "in-finance" as const,
      nextStage: "Finance verification",
      nextActor: "Finance Officer",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 5", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 5", actor: "Sanil Davis", kind: "approved" as const },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Manager", assignedActorName: "Sanil Davis", status: "pending" as const },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const pending = steps.filter((s) => s.pending);
    expect(pending.length).toBeGreaterThan(0);
    for (const step of pending) {
      expect(step.icon).toBe(Clock);
    }
    expect(steps[1]).toMatchObject({ label: "Approved", pending: false });
    expect(steps[1].icon).toBe(KIND_META.approved.icon);
  });
});

