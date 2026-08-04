import { describe, expect, it } from "vitest";
import { expenses, type Expense } from "./mock-data";
import { dashboardStats } from "./dashboard-stats";

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

describe("dashboardStats", () => {
  it("sums in-month spend excluding drafts, and counts it", () => {
    const list = [
      expense({ id: "e1", status: "in-finance", amount: 100, submittedAt: "2026-08-03T10:00:00Z" }),
      expense({ id: "e2", status: "draft", amount: 250, submittedAt: "2026-08-04T10:00:00Z" }),
      expense({ id: "e7", status: "rejected", amount: 60, submittedAt: "2026-08-10T10:00:00Z" }),
    ];
    const stats = dashboardStats(list, "2026-08");
    expect(stats.spentThisMonth).toBe(160);
    expect(stats.spentThisMonthCount).toBe(2);
  });

  it("ignores spend from other months", () => {
    const list = [
      expense({ id: "e1", status: "in-finance", amount: 100, submittedAt: "2026-07-28T10:00:00Z" }),
      expense({ id: "e3", status: "paid", amount: 50, submittedAt: "2026-06-15T10:00:00Z" }),
    ];
    expect(dashboardStats(list, "2026-08").spentThisMonth).toBe(0);
  });

  it("counts pending approval and needs correction across all months", () => {
    const list = [
      expense({ id: "e5", status: "submitted", submittedAt: "2026-07-20T10:00:00Z" }),
      expense({ id: "e5b", status: "in-approval", submittedAt: "2026-06-10T10:00:00Z" }),
      expense({ id: "e6", status: "needs-correction", submittedAt: "2026-07-19T10:00:00Z" }),
    ];
    const stats = dashboardStats(list, "2026-08");
    expect(stats.pendingApproval).toBe(2);
    expect(stats.needsCorrection).toBe(1);
  });

  it("sums reimbursements for the month only", () => {
    const list = [
      expense({ id: "e4", status: "paid", amount: 75, submittedAt: "2026-08-01T10:00:00Z" }),
      expense({ id: "e3", status: "paid", amount: 50, submittedAt: "2026-07-28T10:00:00Z" }),
      expense({ id: "e7", status: "rejected", amount: 60, submittedAt: "2026-08-10T10:00:00Z" }),
    ];
    expect(dashboardStats(list, "2026-08").reimbursedThisMonth).toBe(75);
  });

  it("derives the expected overview from the full mock dataset", () => {
    expect(dashboardStats(expenses, "2026-08")).toEqual({
      spentThisMonth: 594,
      spentThisMonthCount: 1,
      pendingApproval: 3,
      needsCorrection: 1,
      reimbursedThisMonth: 0,
    });
    expect(dashboardStats(expenses, "2026-07")).toEqual({
      spentThisMonth: 2077,
      spentThisMonthCount: 10,
      pendingApproval: 3,
      needsCorrection: 1,
      reimbursedThisMonth: 461,
    });
  });
});
