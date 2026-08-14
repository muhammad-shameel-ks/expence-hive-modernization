import { describe, expect, it, vi } from "vitest";
import {
  approverStatCards,
  employeeStatCards,
  financeStatCards,
} from "./dashboard-stats";
import type { ApproverAggregates, EmployeeAggregates, FinanceAggregates } from "@/server/expenses/dashboard-read-models";

const EMPLOYEE: EmployeeAggregates = {
  spentMinor: 59400,
  spentCount: 1,
  pendingMinor: 99000,
  pendingCount: 2,
  draftsCount: 1,
  reimbursedMinor: 7500,
  reimbursedCount: 1,
};

const APPROVER: ApproverAggregates = {
  awaitingMyActionCount: 3,
  awaitingMyActionTotalMinor: 150000,
  agedCount: 1,
  agedClaimIds: ["claim-aged-1"],
};

const FINANCE: FinanceAggregates = {
  queueCount: 4,
  queueTotalMinor: 250000,
  paidOutMinor: 125000,
  paidOutCount: 3,
  agedCount: 2,
  agedClaimIds: ["claim-aged-1", "claim-aged-2"],
  rejectedCount: 1,
  rejectedTotalMinor: 6000,
};

describe("employeeStatCards", () => {
  it("shows spent, pending (amount + count), drafts CTA, and reimbursed for the period", () => {
    const cards = employeeStatCards(EMPLOYEE, "this month", { onResumeDraft: vi.fn() });
    expect(cards.map((card) => card.label)).toEqual([
      "Spent this month",
      "Pending reimbursements",
      "Drafts",
      "Reimbursed this month",
    ]);
    expect(cards[0]).toMatchObject({ value: "₹594.00", hint: "1 expense" });
    expect(cards[1]).toMatchObject({ value: "₹990.00", hint: "2 claims awaiting payment" });
    expect(cards[2]).toMatchObject({ value: "1", action: { label: "Resume draft" } });
    expect(cards[3]).toMatchObject({ value: "₹75.00", hint: "1 payment received" });
  });

  it("pluralizes counts and formats the period into labels", () => {
    const cards = employeeStatCards(
      { ...EMPLOYEE, spentCount: 3, pendingCount: 1, reimbursedCount: 2 },
      "this year",
      { onResumeDraft: vi.fn() },
    );
    expect(cards[0].label).toBe("Spent this year");
    expect(cards[0].hint).toBe("3 expenses");
    expect(cards[1].hint).toBe("1 claim awaiting payment");
    expect(cards[3].label).toBe("Reimbursed this year");
    expect(cards[3].hint).toBe("2 payments received");
  });

  it("swaps hints for empty states and drops the drafts CTA when there is nothing to resume", () => {
    const empty = employeeStatCards(
      { ...EMPLOYEE, spentCount: 0, pendingCount: 0, draftsCount: 0, reimbursedCount: 0 },
      "overall",
      { onResumeDraft: vi.fn() },
    );
    expect(empty[0].hint).toBe("Nothing spent overall");
    expect(empty[1].hint).toBe("Nothing awaiting payment");
    expect(empty[2].hint).toBe("No drafts yet - submit a new claim");
    expect(empty[2].action).toBeUndefined();
    expect(empty[3].hint).toBe("Nothing reimbursed overall");
  });

  it("wires the drafts CTA to the resume callback", () => {
    const onResumeDraft = vi.fn();
    const cards = employeeStatCards(EMPLOYEE, "this month", { onResumeDraft });
    cards[2].action?.onClick?.();
    expect(onResumeDraft).toHaveBeenCalledTimes(1);
  });
});

describe("approverStatCards", () => {
  it("shows awaiting my action (total + count) and aging", () => {
    const cards = approverStatCards(APPROVER, 3, { onReviewAged: vi.fn() });
    expect(cards.map((card) => card.label)).toEqual(["Awaiting my action", "Aging"]);
    expect(cards[0]).toMatchObject({
      value: "₹1,500.00",
      hint: "3 claims need a decision",
      action: { label: "Review all", href: "/expenses/approvals" },
    });
    expect(cards[1]).toMatchObject({ value: "1", hint: "Stuck beyond the 3-day timeout" });
  });

  it("names the configured timeout in the aging hints", () => {
    const cards = approverStatCards({ ...APPROVER, agedCount: 0 }, 7, {
      onReviewAged: vi.fn(),
    });
    expect(cards[1].hint).toBe("Nothing past the 7-day timeout");
    expect(cards[1].action).toBeUndefined();
  });

  it("wires the aged-review CTA", () => {
    const onReviewAged = vi.fn();
    const cards = approverStatCards(APPROVER, 3, { onReviewAged });
    expect(cards[1].action).toEqual({ label: "Review oldest", onClick: expect.any(Function) });
    cards[1].action?.onClick?.();
    expect(onReviewAged).toHaveBeenCalledTimes(1);
  });
});

describe("financeStatCards", () => {
  it("shows queue backlog, paid out, aged, and rejected for the period", () => {
    const cards = financeStatCards(FINANCE, "this month", 3, { onReviewAged: vi.fn() });
    expect(cards.map((card) => card.label)).toEqual([
      "Queue backlog",
      "Paid out this month",
      "Aged claims",
      "Rejected this month",
    ]);
    expect(cards[0]).toMatchObject({ value: "₹2,500.00", hint: "4 claims awaiting verification or payment" });
    expect(cards[1]).toMatchObject({ value: "₹1,250.00", hint: "3 claims paid" });
    expect(cards[2]).toMatchObject({ value: "2", hint: "Stuck beyond the 3-day timeout" });
    expect(cards[3]).toMatchObject({ value: "1", hint: "₹60.00 rejected" });
  });

  it("links the queue card to the payment queue page", () => {
    const cards = financeStatCards(FINANCE, "this month", 3, { onReviewAged: vi.fn() });
    expect(cards[0].action).toEqual({ label: "Open queue", href: "/finance/payments" });
  });

  it("swaps hints for empty states", () => {
    const cards = financeStatCards(
      { ...FINANCE, queueCount: 0, paidOutCount: 0, agedCount: 0, rejectedCount: 0 },
      "this month",
      3,
      { onReviewAged: vi.fn() },
    );
    expect(cards[0].hint).toBe("Queue is clear");
    expect(cards[1].hint).toBe("Nothing paid out this month");
    expect(cards[2].hint).toBe("Nothing past the 3-day timeout");
    expect(cards[3].hint).toBe("Nothing rejected this month");
    expect(cards[2].action).toBeUndefined();
  });
});
