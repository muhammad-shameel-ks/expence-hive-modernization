import { describe, expect, it } from "vitest";
import { expenses, type Expense } from "./mock-data";
import { currentExpense } from "./current-expense";

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

describe("currentExpense", () => {
  it("picks the most recently submitted non-terminal expense", () => {
    const list = [
      expense({ id: "old", submittedAt: "2026-07-20T09:00:00Z", status: "in-approval" }),
      expense({ id: "newest", submittedAt: "2026-08-03T09:00:00Z", status: "in-finance" }),
      expense({ id: "mid", submittedAt: "2026-07-29T09:00:00Z", status: "needs-correction" }),
    ];
    expect(currentExpense(list)?.id).toBe("newest");
  });

  it("ignores paid and rejected expenses even when they are the most recent", () => {
    const list = [
      expense({ id: "paid", submittedAt: "2026-08-05T09:00:00Z", status: "paid" }),
      expense({ id: "rejected", submittedAt: "2026-08-04T09:00:00Z", status: "rejected" }),
      expense({ id: "active", submittedAt: "2026-08-03T09:00:00Z", status: "approved" }),
    ];
    expect(currentExpense(list)?.id).toBe("active");
  });

  it("prefers a submitted claim over a newer draft", () => {
    const list = [
      expense({ id: "draft", submittedAt: "2026-08-06T09:00:00Z", status: "draft" }),
      expense({ id: "submitted", submittedAt: "2026-08-02T09:00:00Z", status: "in-approval" }),
    ];
    expect(currentExpense(list)?.id).toBe("submitted");
  });

  it("falls back to the newest draft when nothing has been submitted yet", () => {
    const list = [
      expense({ id: "draft-old", submittedAt: "2026-07-10T09:00:00Z", status: "draft" }),
      expense({ id: "draft-new", submittedAt: "2026-08-01T09:00:00Z", status: "draft" }),
    ];
    expect(currentExpense(list)?.id).toBe("draft-new");
  });

  it("returns null when every expense is terminal", () => {
    const list = [
      expense({ id: "paid", status: "paid" }),
      expense({ id: "rejected", status: "rejected" }),
    ];
    expect(currentExpense(list)).toBeNull();
  });

  it("returns the Figma renewal for the full mock dataset", () => {
    expect(currentExpense(expenses)?.id).toBe("ex-figma");
  });
});
