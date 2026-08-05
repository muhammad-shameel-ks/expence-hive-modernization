import { describe, expect, it } from "vitest";
import { expenses, type Expense } from "./mock-data";
import { filterAndSortExpenses } from "./expense-query";

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

describe("filterAndSortExpenses", () => {
  it("matches search against title, ref, and category, case-insensitively", () => {
    const list = [
      expense({ id: "by-title", title: "Figma renewal" }),
      expense({ id: "by-ref", ref: "EXP-2026-0138" }),
      expense({ id: "by-category", category: "Travel" }),
      expense({ id: "no-match", title: "Office snacks" }),
    ];
    expect(filterAndSortExpenses(list, { query: "figma" }).map((e) => e.id)).toEqual(["by-title"]);
    expect(filterAndSortExpenses(list, { query: "exp-2026-0138" }).map((e) => e.id)).toEqual(["by-ref"]);
    expect(filterAndSortExpenses(list, { query: "travel" }).map((e) => e.id)).toEqual(["by-category"]);
  });

  it("trims the search query and ignores empty queries", () => {
    const list = [expense({ id: "a" }), expense({ id: "b" })];
    expect(filterAndSortExpenses(list, { query: "   " })).toHaveLength(2);
  });

  it("groups statuses into the Needs action, In progress, and Paid filters", () => {
    const ids = (filter: "All" | "Needs action" | "In progress" | "Paid") =>
      filterAndSortExpenses(expenses, { filter }).map((e) => e.id);

    expect(ids("Needs action")).toHaveLength(2);
    expect(ids("Needs action")).toContain("ex-dinner");
    expect(ids("Needs action")).toContain("ex-team-lunch");

    expect(ids("In progress")).toHaveLength(5);
    expect(ids("In progress")).toContain("ex-figma");

    expect(ids("Paid")).toHaveLength(4);
    expect(ids("Paid")).toContain("ex-snacks");
    expect(ids("Paid")).not.toContain("ex-figma");
  });

  it("sorts by amount in either direction", () => {
    const asc = filterAndSortExpenses(expenses, { sortKey: "amount", sortDir: 1 });
    expect(asc[0].amount).toBe(18);
    expect(asc[asc.length - 1].amount).toBe(620);

    const desc = filterAndSortExpenses(expenses, { sortKey: "amount", sortDir: -1 });
    expect(desc[0].amount).toBe(620);
    expect(desc[desc.length - 1].amount).toBe(18);
  });

  it("sorts by date using submission time, newest first by default", () => {
    const list = [
      expense({ id: "newest", submittedAt: "2026-08-03T09:00:00Z", status: "in-finance" }),
      expense({ id: "older", submittedAt: "2026-07-29T13:20:00Z", status: "in-approval" }),
      expense({ id: "newest-again", submittedAt: "2026-08-03T10:00:00Z", status: "approved" }),
    ];
    const byDate = filterAndSortExpenses(list, { sortKey: "date" });
    expect(byDate.map((e) => e.id)).toEqual(["newest-again", "newest", "older"]);

    const oldestFirst = filterAndSortExpenses(list, { sortKey: "date", sortDir: 1 });
    expect(oldestFirst.map((e) => e.id)).toEqual(["older", "newest", "newest-again"]);
  });

  it("always pins drafts to the end of a date sort", () => {
    const list = [
      expense({ id: "draft-new", submittedAt: "2026-08-06T09:00:00Z", status: "draft" }),
      expense({ id: "submitted-old", submittedAt: "2026-07-01T09:00:00Z", status: "submitted" }),
      expense({ id: "draft-old", submittedAt: "2026-07-02T09:00:00Z", status: "draft" }),
    ];
    expect(filterAndSortExpenses(list, { sortKey: "date" }).map((e) => e.id)).toEqual([
      "submitted-old",
      "draft-new",
      "draft-old",
    ]);
  });

  it("combines search and filter", () => {
    const result = filterAndSortExpenses(expenses, { query: "team", filter: "Needs action" });
    expect(result.map((e) => e.id)).toEqual(["ex-team-lunch"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterAndSortExpenses(expenses, { query: "zzz-no-such-expense" })).toEqual([]);
  });

  it("filters by exact status list", () => {
    const list = [
      expense({ id: "a", status: "draft" }),
      expense({ id: "b", status: "paid" }),
      expense({ id: "c", status: "rejected" }),
    ];
    expect(filterAndSortExpenses(list, { statuses: ["draft", "rejected"] }).map((e) => e.id)).toEqual([
      "c",
      "a",
    ]);
  });

  it("filters by category list", () => {
    const list = [
      expense({ id: "a", category: "Travel" }),
      expense({ id: "b", category: "Meals" }),
      expense({ id: "c", category: "Software" }),
    ];
    expect(filterAndSortExpenses(list, { categories: ["Travel", "Software"] }).map((e) => e.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("filters by amount range, inclusive on both bounds", () => {
    const list = [
      expense({ id: "low", amount: 50 }),
      expense({ id: "mid", amount: 100 }),
      expense({ id: "high", amount: 150 }),
    ];
    expect(filterAndSortExpenses(list, { amountMin: 100, amountMax: 100 }).map((e) => e.id)).toEqual([
      "mid",
    ]);
    expect(filterAndSortExpenses(list, { amountMin: 100 }).map((e) => e.id).sort()).toEqual(["high", "mid"]);
    expect(filterAndSortExpenses(list, { amountMax: 100 }).map((e) => e.id).sort()).toEqual(["low", "mid"]);
  });

  it("filters by submission date range, inclusive on both bounds", () => {
    const list = [
      expense({ id: "before", submittedAt: "2026-07-01T09:00:00Z" }),
      expense({ id: "on-bound", submittedAt: "2026-08-04T23:00:00Z" }),
      expense({ id: "after", submittedAt: "2026-09-01T09:00:00Z" }),
    ];
    expect(
      filterAndSortExpenses(list, { dateFrom: "2026-08-01", dateTo: "2026-08-31" }).map((e) => e.id),
    ).toEqual(["on-bound"]);
  });

  it("sorts by title, category, and status", () => {
    const list = [
      expense({ id: "b", title: "Banana", category: "Meals", status: "approved" }),
      expense({ id: "a", title: "Apple", category: "Travel", status: "draft" }),
    ];
    expect(filterAndSortExpenses(list, { sortKey: "title", sortDir: 1 }).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
    expect(filterAndSortExpenses(list, { sortKey: "category", sortDir: 1 }).map((e) => e.id)).toEqual([
      "b",
      "a",
    ]);
    // status rank follows the journey order in STATUS_META: draft comes before approved.
    expect(filterAndSortExpenses(list, { sortKey: "status", sortDir: 1 }).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
