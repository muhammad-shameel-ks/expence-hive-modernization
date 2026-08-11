import { describe, expect, it } from "vitest";
import { Clock, PauseCircle, PlayCircle } from "lucide-react";
import { formatMoney, HELD_META, simplifyAutoSkipDetail, submittedLabel, KIND_META, getKindMeta } from "./journey-meta";
import { getJourneyFlowItems } from "./journey-flow";
import { claimToExpense } from "./expense-read-model";

describe("getKindMeta", () => {
  it("returns KIND_META for known history kinds", () => {
    expect(getKindMeta("submitted")).toMatchObject({ label: "Submitted", tone: "info" });
    expect(getKindMeta("approved")).toMatchObject({ label: "Approved", tone: "success" });
  });

  it("returns a safe default for unknown or missing history kinds without throwing", () => {
    expect(getKindMeta("custom-action")).toMatchObject({ label: "Custom Action", tone: "muted", icon: Clock });
    expect(getKindMeta(undefined)).toMatchObject({ label: "Activity", tone: "muted", icon: Clock });
  });
});

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

describe("simplifyAutoSkipDetail", () => {
  it("drops the claim total and keeps just the skip condition", () => {
    expect(simplifyAutoSkipDetail("Total ₹1999 at or under ₹2000 guard on Finance Head step")).toBe("at or under ₹2000");
    expect(simplifyAutoSkipDetail("Total ₹300 under ₹5000 guard on Manager step")).toBe("under ₹5000");
    expect(simplifyAutoSkipDetail("Total ₹6000 above ₹5000 guard on team lead step")).toBe("above ₹5000");
  });

  it("passes through an unrecognized detail unchanged", () => {
    expect(simplifyAutoSkipDetail("Something else entirely")).toBe("Something else entirely");
  });
});

describe("hold journey meta", () => {
  it("maps held and resumed history kinds to their timeline entries", () => {
    expect(KIND_META.held).toMatchObject({ label: "Held", tone: "warning", icon: PauseCircle });
    expect(KIND_META.resumed).toMatchObject({ label: "Resumed", tone: "primary", icon: PlayCircle });
  });

  it("exposes the held badge meta with a warning tone", () => {
    expect(HELD_META).toEqual({ label: "Held", tone: "warning" });
  });

  it("renders held and resumed events on the timeline in order", () => {
    const expense = {
      id: "ex-held",
      ref: "EXP-HELD",
      title: "Held claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 5",
      submittedAt: "2026-08-05T10:00:00Z",
      status: "in-approval" as const,
      held: {
        by: "Sanil Davis",
        at: "2026-08-06T10:00:00Z",
        reason: "Awaiting the missing invoice",
      },
      attachments: [],
      history: [
        { id: "h1", date: "Aug 5", actor: "Shameel", kind: "submitted" as const },
        {
          id: "h2",
          date: "Aug 6",
          actor: "Sanil Davis",
          actorId: "emp-sanil",
          kind: "held" as const,
          detail: "Awaiting the missing invoice",
        },
      ],
      steps: [
        {
          id: "s1",
          roleId: "r1",
          roleName: "Manager",
          assignedActorName: "Sanil Davis",
          status: "pending" as const,
        },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    expect(steps[0]).toMatchObject({ label: "Submitted", pending: false });
    expect(steps[1]).toMatchObject({ label: "Held", pending: false, icon: PauseCircle });
    // A held claim pulses nothing as next: the hold outranks the pending
    // stage, and the stage reads as on hold.
    const heldStage = steps[2];
    expect(heldStage).toMatchObject({ label: "Manager", pending: true, detail: "On hold - awaiting resume" });
    expect(heldStage.isNext).toBe(false);
    expect(steps.filter((step) => step.isNext)).toHaveLength(0);
  });

  it("marks the held event as the current point of the journey", () => {
    const expense = {
      id: "ex-held-2",
      ref: "EXP-HELD-2",
      title: "Held claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 5",
      submittedAt: "2026-08-05T10:00:00Z",
      status: "in-approval" as const,
      held: { by: "Sanil Davis", at: "2026-08-06T10:00:00Z", reason: "Awaiting docs" },
      attachments: [],
      history: [
        { id: "h1", date: "Aug 5", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 5", actor: "Sanil Davis", kind: "approved" as const },
        {
          id: "h3",
          date: "Aug 6",
          actor: "Sanil Davis",
          kind: "held" as const,
          detail: "Awaiting docs",
        },
      ],
      steps: [
        {
          id: "s1",
          roleId: "r1",
          roleName: "Manager",
          assignedActorName: "Sanil Davis",
          status: "pending" as const,
        },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const heldEvent = steps.find((step) => step.label === "Held");
    expect(heldEvent?.isCurrent).toBe(true);
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

  it("renders an amount-guard auto-skip distinctly from a stage-skipped entry", () => {
    const expense = {
      id: "ex-auto",
      ref: "EXP-AUTO",
      title: "Small claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 6",
      submittedAt: "2026-08-06T10:00:00Z",
      status: "in-approval" as const,
      nextStage: "Manager",
      nextActor: "Sanil Davis",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 6", actor: "Shameel", kind: "submitted" as const },
        {
          id: "h2",
          date: "Aug 6",
          actor: "Policy",
          kind: "auto-skipped" as const,
          detail: "Total ₹300 under ₹5000 guard on Finance Head step",
        },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Manager", assignedActorName: "Sanil Davis", status: "pending" as const },
        {
          id: "s2",
          roleId: "r2",
          roleName: "Finance Head",
          status: "skipped" as const,
          skipReason: "Total ₹300 under ₹5000 guard on Finance Head step",
          decidedAt: "Aug 6",
        },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const autoSkip = steps.find((step) => step.id === "auto-skipped-step-s2");
    expect(autoSkip).toMatchObject({
      label: "Finance Head",
      detail: "Skipped: under ₹5000",
      pending: false,
      tone: "muted",
      date: "Aug 6",
    });
    expect(autoSkip?.label).not.toBe(KIND_META.skipped.label);
    expect(autoSkip?.label).not.toBe(KIND_META["auto-skipped"].label);
  });

  it("renders an auto-skipped step in flow order, titled by its role name with the guard reason as the detail", () => {
    const expense = {
      id: "ex-order",
      ref: "EXP-ORDER",
      title: "Small claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 6",
      submittedAt: "2026-08-06T10:00:00Z",
      status: "in-approval" as const,
      nextStage: "Manager",
      nextActor: "Sanil Davis",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 6", actor: "Shameel", kind: "submitted" as const },
        {
          id: "h2",
          date: "Aug 6",
          actor: "Policy",
          kind: "auto-skipped" as const,
          detail: "Total ₹300 under ₹5000 guard on Finance Head step",
        },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Manager", assignedActorName: "Sanil Davis", status: "pending" as const },
        {
          id: "s2",
          roleId: "r2",
          roleName: "Finance Head",
          status: "skipped" as const,
          skipReason: "Total ₹300 under ₹5000 guard on Finance Head step",
        },
        {
          id: "s3",
          roleId: "r3",
          roleName: "Finance Executive",
          assignedActorName: "Rishikesh",
          status: "pending" as const,
        },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const labels = steps.map((step) => step.label);
    expect(labels).toEqual([
      "Submitted",
      "Manager",
      "Finance Head",
      "Finance Executive",
      "Paid",
    ]);
    const autoSkip = steps.find((step) => step.label === "Finance Head");
    expect(autoSkip).toMatchObject({
      detail: "Skipped: under ₹5000",
      pending: false,
      tone: "muted",
    });
  });

  it("pulses the first pending stage, not an earlier auto-skipped stage", () => {
    const expense = {
      id: "ex-pulse",
      ref: "EXP-PULSE",
      title: "Small claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 6",
      submittedAt: "2026-08-06T10:00:00Z",
      status: "in-finance" as const,
      nextStage: "Finance Executive",
      nextActor: "Rishikesh",
      attachments: [],
      history: [
        { id: "h1", date: "Aug 6", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 6", actor: "Sanil Davis", kind: "approved" as const },
        {
          id: "h3",
          date: "Aug 6",
          actor: "Policy",
          kind: "auto-skipped" as const,
          detail: "Total ₹300 under ₹5000 guard on Finance Head step",
        },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Manager", assignedActorName: "Sanil Davis", status: "approved" as const },
        {
          id: "s2",
          roleId: "r2",
          roleName: "Finance Head",
          status: "skipped" as const,
          skipReason: "Total ₹300 under ₹5000 guard on Finance Head step",
          decidedAt: "Aug 6",
        },
        {
          id: "s3",
          roleId: "r3",
          roleName: "Finance Executive",
          assignedActorName: "Rishikesh",
          status: "pending" as const,
        },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const nextStep = steps.find((step) => step.isNext);
    expect(nextStep?.label).toBe("Finance Executive");
    const financeHead = steps.find((step) => step.id === "auto-skipped-step-s2");
    expect(financeHead?.isNext).toBe(false);
  });

  it("keeps an auto-skipped stage in the timeline after the claim is paid", () => {
    const expense = {
      id: "ex-paid-skip",
      ref: "EXP-PAID-SKIP",
      title: "Small claim",
      category: "Travel",
      amount: 300,
      currency: "INR",
      date: "Aug 6",
      submittedAt: "2026-08-06T10:00:00Z",
      status: "paid" as const,
      attachments: [],
      history: [
        { id: "h1", date: "Aug 6", actor: "Shameel", kind: "submitted" as const },
        { id: "h2", date: "Aug 6", actor: "Sanil Davis", kind: "approved" as const },
        {
          id: "h3",
          date: "Aug 6",
          actor: "Policy",
          kind: "auto-skipped" as const,
          detail: "Total ₹300 under ₹5000 guard on Finance Head step",
        },
        { id: "h4", date: "Aug 7", actor: "Rishikesh", kind: "verified" as const },
        { id: "h5", date: "Aug 7", actor: "Rishikesh", kind: "paid" as const },
      ],
      steps: [
        { id: "s1", roleId: "r1", roleName: "Manager", assignedActorName: "Sanil Davis", status: "approved" as const },
        {
          id: "s2",
          roleId: "r2",
          roleName: "Finance Head",
          status: "skipped" as const,
          skipReason: "Total ₹300 under ₹5000 guard on Finance Head step",
          decidedAt: "Aug 6",
        },
        { id: "s3", roleId: "r3", roleName: "Finance Executive", assignedActorName: "Rishikesh", status: "verified" as const },
      ],
    };

    const steps = getJourneyFlowItems(expense);
    const labels = steps.map((step) => step.label);
    expect(labels).toEqual([
      "Submitted",
      "Approved",
      "Finance Head",
      "Finance verified",
      "Paid",
    ]);
    const financeHead = steps.find((step) => step.id === "auto-skipped-step-s2");
    expect(financeHead).toMatchObject({
      detail: "Skipped: under ₹5000",
      pending: false,
    });
  });
});

describe("payment queue claim journey integration", () => {
  it("renders auto-skipped step with guard reason when payment queue claim is converted via claimToExpense", () => {
    const claim = {
      id: "claim-auto-skip",
      ref: "EXP-8888",
      organizationId: "org-1",
      requesterId: "emp-1",
      title: "Team lunch",
      category: "Meals",
      subCategory: "",
      remark: "",
      amountMinor: 40000,
      currency: "INR",
      expenseDate: "2026-08-05",
      status: "in-finance" as const,
      createdAt: "2026-08-05T10:00:00.000Z",
      submittedAt: "2026-08-05T10:00:00.000Z",
      version: 1,
      history: [
        { id: "h1", kind: "submitted" as const, actorId: "emp-1", createdAt: "2026-08-05T10:00:00.000Z" },
        { id: "h2", kind: "approved" as const, actorId: "emp-2", createdAt: "2026-08-05T11:00:00.000Z" },
        {
          id: "h3",
          kind: "auto-skipped" as const,
          actorId: null,
          detail: "Total ₹400 under ₹5000 guard on Finance Head step",
          createdAt: "2026-08-05T11:00:00.000Z",
        },
      ],
      steps: [
        { id: "s1", roleId: "role-manager", status: "approved" as const, decidedAt: "2026-08-05T11:00:00.000Z" },
        {
          id: "s2",
          roleId: "role-finance-head",
          status: "skipped" as const,
          skipReason: "Total ₹400 under ₹5000 guard on Finance Head step",
          decidedAt: "2026-08-05T11:00:00.000Z",
        },
        { id: "s3", roleId: "role-finance-executive", status: "pending" as const },
      ],
    };

    const employees = [
      { id: "emp-1", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null },
      { id: "emp-2", organizationId: "org-1", name: "Grace Hopper", role: null, active: true, managerId: null },
      {
        id: "emp-3",
        organizationId: "org-1",
        name: "Finance Head User",
        role: { id: "role-finance-head", code: "finance-head", displayName: "Finance Head" },
        active: true,
        managerId: null,
      },
    ];

    const expense = claimToExpense(claim, employees);
    const steps = getJourneyFlowItems(expense);

    const labels = steps.map((s) => s.label);
    expect(labels).toContain("Finance Head");

    const skippedStep = steps.find((s) => s.id === "auto-skipped-step-s2");
    expect(skippedStep).toBeDefined();
    expect(skippedStep).toMatchObject({
      label: "Finance Head",
      detail: "Skipped: under ₹5000",
      actor: "Policy",
      pending: false,
      tone: "muted",
    });
  });

  it("surfaces journey for a rejected payment queue claim cleanly without pending steps", () => {
    const claim = {
      id: "claim-rejected-queue",
      ref: "EXP-9999",
      organizationId: "org-1",
      requesterId: "emp-1",
      title: "Conference travel",
      category: "Travel",
      subCategory: "",
      remark: "",
      amountMinor: 150000,
      currency: "INR",
      expenseDate: "2026-08-01",
      status: "rejected" as const,
      createdAt: "2026-08-01T10:00:00.000Z",
      submittedAt: "2026-08-01T10:00:00.000Z",
      version: 1,
      history: [
        { id: "h1", kind: "submitted" as const, actorId: "emp-1", createdAt: "2026-08-01T10:00:00.000Z" },
        { id: "h2", kind: "rejected" as const, actorId: "emp-2", detail: "Exceeds policy allowance", createdAt: "2026-08-02T12:00:00.000Z" },
      ],
      steps: [
        { id: "s1", roleId: "role-manager", status: "rejected" as const, decidedAt: "2026-08-02T12:00:00.000Z" },
      ],
    };

    const employees = [
      { id: "emp-1", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null },
      { id: "emp-2", organizationId: "org-1", name: "Grace Hopper", role: null, active: true, managerId: null },
    ];

    const expense = claimToExpense(claim, employees);
    const steps = getJourneyFlowItems(expense);

    expect(steps.some((s) => s.pending)).toBe(false);
    const rejectedItem = steps.find((s) => s.label === "Rejected");
    expect(rejectedItem).toBeDefined();
    expect(rejectedItem?.detail).toBe("Exceeds policy allowance");
  });
});


