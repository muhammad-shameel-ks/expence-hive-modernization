import { describe, expect, it } from "vitest";
import { expenses, type Expense } from "./mock-data";
import {
  expenseFilterKey,
  expenseFilterParams,
  filterAndSortExpenses,
  parseExpenseSearchParams,
  QUICK_STATUS_CHIPS,
  type ExpenseFilter,
  type ExpenseQuery,
} from "./expense-query";

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

  it("filters by one-per-status chips (ADR-0021)", () => {
    const ids = (filter: ExpenseFilter) => filterAndSortExpenses(expenses, { filter }).map((e) => e.id);

    expect(ids("All")).toHaveLength(expenses.length);
    expect(ids("draft")).toEqual(["ex-team-lunch"]);

    expect(ids("submitted")).toEqual(["ex-aws"]);
    expect(ids("in-approval")).toEqual(expect.arrayContaining(["ex-flight", "ex-course"]));
    expect(ids("approved")).toEqual(["ex-hotel"]);
    expect(ids("in-finance")).toEqual(["ex-figma"]);
    expect(ids("paid")).toEqual(expect.arrayContaining(["ex-snacks", "ex-taxi", "ex-karting", "ex-domain"]));
    expect(ids("rejected")).toEqual(expect.arrayContaining(["ex-dinner", "ex-hub"]));
  });

  it("keeps grouped intents expressible through the status multi-select", () => {
    // The old "Needs action" group was drafts; "In progress" covered the
    // submitted..in-finance journey (ADR-0021 keeps them via the advanced layer).
    const needsAction = filterAndSortExpenses(expenses, { statuses: ["draft"] }).map((e) => e.id);
    expect(needsAction).toEqual(["ex-team-lunch"]);

    const inProgress = filterAndSortExpenses(expenses, {
      statuses: ["submitted", "in-approval", "approved", "in-finance"],
    }).map((e) => e.id);
    expect(inProgress).toHaveLength(5);
    expect(inProgress).toContain("ex-figma");
    expect(inProgress).not.toContain("ex-snacks");
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
    const result = filterAndSortExpenses(expenses, { query: "team", filter: "draft" });
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

describe("QUICK_STATUS_CHIPS", () => {
  it("is All followed by one chip per status in STATUS_META order (ADR-0021)", () => {
    expect(QUICK_STATUS_CHIPS.map((chip) => chip.filter)).toEqual([
      "All",
      "draft",
      "submitted",
      "in-approval",
      "approved",
      "in-finance",
      "paid",
      "rejected",
    ]);
  });

  it("labels the paid chip Paid while the badge keeps the STATUS_META label", () => {
    expect(QUICK_STATUS_CHIPS.find((c) => c.filter === "paid")?.label).toBe("Paid");
    expect(QUICK_STATUS_CHIPS.find((c) => c.filter === "in-finance")?.label).toBe("In finance");
  });
});

describe("expense URL round-trip (ADR-0021)", () => {
  it("parses every filter field from the query string", () => {
    const parsed = parseExpenseSearchParams(
      "q=figma&status=approved&cats=Software,Meals&min=50&max=500&from=2026-08-01&to=2026-08-31&sort=amount&dir=asc",
    );
    expect(parsed).toEqual({
      query: "figma",
      filter: "approved",
      categories: ["Software", "Meals"],
      amountMin: 50,
      amountMax: 500,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      sortKey: "amount",
      sortDir: 1,
    });
  });

  it("parses the status multi-select and lets it win over the chip on a stale URL", () => {
    expect(parseExpenseSearchParams("statuses=submitted,paid")).toEqual({
      statuses: ["submitted", "paid"],
    });
    // The chip and the multi-select never intersect (ADR-0021); the explicit
    // list wins so a stale URL degrades to a usable view instead of nothing.
    expect(parseExpenseSearchParams("status=approved&statuses=paid,rejected")).toEqual({
      statuses: ["paid", "rejected"],
    });
  });

  it("serializes the same state back to the same params", () => {
    const query: ExpenseQuery = {
      query: "figma",
      filter: "approved",
      categories: ["Software", "Meals"],
      amountMin: 50,
      amountMax: 500,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
      sortKey: "amount",
      sortDir: 1,
    };
    const serialized = expenseFilterParams(query).toString();
    expect(serialized).toBe(
      "q=figma&status=approved&cats=Software%2CMeals&min=50&max=500&from=2026-08-01&to=2026-08-31&sort=amount&dir=asc",
    );
    expect(parseExpenseSearchParams(serialized)).toEqual(query);
  });

  it("round-trips a partial state (defaults omitted)", () => {
    const query: ExpenseQuery = { filter: "paid", amountMin: 100 };
    const serialized = expenseFilterParams(query).toString();
    expect(serialized).toBe("status=paid&min=100");
    expect(parseExpenseSearchParams(serialized)).toEqual({ filter: "paid", amountMin: 100 });
  });

  it("omits default values entirely (All chip, date sort newest first)", () => {
    expect(expenseFilterParams({}).toString()).toBe("");
    expect(expenseFilterParams({ filter: "All" }).toString()).toBe("");
    expect(expenseFilterParams({ sortKey: "date", sortDir: -1 }).toString()).toBe("");
  });

  it("keeps the sort key when it is not the default, and keeps dir only when non-default", () => {
    expect(expenseFilterParams({ sortKey: "amount" }).toString()).toBe("sort=amount");
    expect(expenseFilterParams({ sortKey: "amount", sortDir: 1 }).toString()).toBe("sort=amount&dir=asc");
    expect(expenseFilterParams({ sortKey: "date", sortDir: 1 }).toString()).toBe("dir=asc");
    // A non-default sort with the default direction keeps the key and drops dir.
    expect(expenseFilterParams({ sortKey: "title", sortDir: 1 }).toString()).toBe("sort=title&dir=asc");
  });

  it("preserves unrelated params when serializing from a current URL", () => {
    const current = new URLSearchParams("claim=ex-123&status=paid");
    expect(expenseFilterParams({ filter: "rejected" }, current).toString()).toBe(
      "claim=ex-123&status=rejected",
    );
  });

  it("ignores malformed or unknown values instead of crashing", () => {
    const parsed = parseExpenseSearchParams(
      "status=bogus&statuses=paid,,approved,bogus&cats=Software,,&min=NaN&max=-5&from=08-2026&to=nope&sort=size&dir=sideways",
    );
    // Malformed min/max/from/to and unknown status/sort/dir fall back to defaults.
    expect(parsed).toEqual({ statuses: ["paid", "approved"], categories: ["Software"] });
    expect(parsed.amountMin).toBeUndefined();
    expect(parsed.amountMax).toBeUndefined();
    expect(parsed.sortKey).toBeUndefined();
    expect(parsed.sortDir).toBeUndefined();
  });

  it("normalizes duplicate statuses and categories on parse", () => {
    const parsed = parseExpenseSearchParams("statuses=paid,paid,submitted&cats=Travel,Travel");
    expect(parsed).toEqual({ statuses: ["paid", "submitted"], categories: ["Travel"] });
  });

  it("treats an empty query string as the all-default state", () => {
    expect(parseExpenseSearchParams("")).toEqual({});
  });

  it("is idempotent: parsing a serialized state yields an equal key", () => {
    const state = { filter: "approved", categories: ["Software"] } satisfies ExpenseQuery;
    const key = expenseFilterKey(state);
    const reparsed = parseExpenseSearchParams(expenseFilterParams(state).toString());
    expect(expenseFilterKey(reparsed)).toBe(key);
  });
});
