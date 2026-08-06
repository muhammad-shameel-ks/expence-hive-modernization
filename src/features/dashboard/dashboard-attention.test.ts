import { describe, expect, it } from "vitest";
import type { Expense } from "./mock-data";
import { groupAttentionItems } from "./dashboard-attention";

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

describe("groupAttentionItems", () => {
  it("puts submitted, in-approval, and in-finance claims in pending", () => {
    const list = [
      expense({ id: "a", status: "submitted" }),
      expense({ id: "b", status: "in-approval" }),
      expense({ id: "c", status: "in-finance" }),
      expense({ id: "d", status: "paid" }),
    ];
    const { pending } = groupAttentionItems(list);
    expect(pending.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("excludes drafts, approved, paid, and rejected from pending", () => {
    const list = [
      expense({ id: "a", status: "draft" }),
      expense({ id: "b", status: "approved" }),
      expense({ id: "c", status: "paid" }),
      expense({ id: "d", status: "rejected" }),
    ];
    const { pending } = groupAttentionItems(list);
    expect(pending).toEqual([]);
  });

  it("returns empty groups for an empty list", () => {
    expect(groupAttentionItems([])).toEqual({ pending: [] });
  });
});
