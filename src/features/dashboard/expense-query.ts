import { STATUS_META, type Expense, type ExpenseStatus } from "./mock-data";

/** One-per-status quick chip (ADR-0021): All, or exactly one status. */
export type ExpenseFilter = "All" | ExpenseStatus;
export type ExpenseSortKey = "date" | "amount" | "title" | "category" | "status";

const FILTER_MATCH: Record<ExpenseStatus, (e: Expense) => boolean> = {
  draft: (e) => e.status === "draft",
  submitted: (e) => e.status === "submitted",
  "in-approval": (e) => e.status === "in-approval",
  approved: (e) => e.status === "approved",
  "in-finance": (e) => e.status === "in-finance",
  paid: (e) => e.status === "paid",
  rejected: (e) => e.status === "rejected",
};

/** Every status in STATUS_META order with the filter-UI label (paid reads "Paid"). */
export const STATUS_CHIP_META: { status: ExpenseStatus; label: string }[] = (
  Object.keys(STATUS_META) as ExpenseStatus[]
).map((status) => ({
  status,
  label: status === "paid" ? "Paid" : STATUS_META[status].label,
}));

/** Quick chips: All followed by one chip per status, in STATUS_META order (ADR-0021). */
export const QUICK_STATUS_CHIPS: { filter: ExpenseFilter; label: string }[] = [
  { filter: "All", label: "All" },
  ...STATUS_CHIP_META.map(({ status, label }) => ({ filter: status, label })),
];

/** Journey order, draft to paid/rejected — used to rank the status sort. */
const STATUS_RANK: Record<ExpenseStatus, number> = Object.fromEntries(
  Object.keys(STATUS_META).map((status, i) => [status, i]),
) as Record<ExpenseStatus, number>;

export interface ExpenseQuery {
  query?: string;
  /** Quick status chip (All or exactly one status, ADR-0021). */
  filter?: ExpenseFilter;
  /** Exact-status multi-select, layered on top of `filter`; lets grouped intents stay expressible. */
  statuses?: ExpenseStatus[];
  /** Category multi-select. */
  categories?: string[];
  amountMin?: number;
  amountMax?: number;
  /** ISO date (yyyy-mm-dd) bounds on submittedAt, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  sortKey?: ExpenseSortKey;
  sortDir?: 1 | -1;
}

export function filterAndSortExpenses(expenses: Expense[], options: ExpenseQuery = {}): Expense[] {
  const {
    query = "",
    filter = "All",
    statuses,
    categories,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    sortKey = "date",
    sortDir = -1,
  } = options;
  const q = query.trim().toLowerCase();

  let list = expenses;
  if (filter !== "All") list = list.filter(FILTER_MATCH[filter]);
  if (statuses && statuses.length > 0) list = list.filter((e) => statuses.includes(e.status));
  if (categories && categories.length > 0) list = list.filter((e) => categories.includes(e.category));
  if (amountMin !== undefined) list = list.filter((e) => e.amount >= amountMin);
  if (amountMax !== undefined) list = list.filter((e) => e.amount <= amountMax);
  if (dateFrom) list = list.filter((e) => e.submittedAt.slice(0, 10) >= dateFrom);
  if (dateTo) list = list.filter((e) => e.submittedAt.slice(0, 10) <= dateTo);
  if (q) {
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q),
    );
  }

  return [...list].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortKey === "amount") {
      av = a.amount;
      bv = b.amount;
    } else if (sortKey === "title") {
      av = a.title.toLowerCase();
      bv = b.title.toLowerCase();
    } else if (sortKey === "category") {
      av = a.category.toLowerCase();
      bv = b.category.toLowerCase();
    } else if (sortKey === "status") {
      av = STATUS_RANK[a.status];
      bv = STATUS_RANK[b.status];
    } else if (a.status === "draft" || b.status === "draft") {
      if (a.status === "draft" && b.status === "draft") return a.id.localeCompare(b.id);
      return a.status === "draft" ? 1 : -1;
    } else {
      av = a.submittedAt;
      bv = b.submittedAt;
    }
    if (av === bv) return a.id.localeCompare(b.id);
    return av > bv ? sortDir : -sortDir;
  });
}

const EXPENSE_FILTER_PARAM_KEYS = ["q", "status", "statuses", "cats", "min", "max", "from", "to", "sort", "dir"] as const;

// The sort catalog is the single source for both the URL/query validation
// (EXPENSE_SORT_KEYS) and the filter section's dropdown labels, so adding a
// sortable column is a one-edit change.
export const EXPENSE_SORT_OPTIONS: {
  value: string;
  key: ExpenseSortKey;
  dir: 1 | -1;
  label: string;
}[] = [
  { value: "date-desc", key: "date", dir: -1, label: "Newest first" },
  { value: "date-asc", key: "date", dir: 1, label: "Oldest first" },
  { value: "amount-desc", key: "amount", dir: -1, label: "Amount: highest first" },
  { value: "amount-asc", key: "amount", dir: 1, label: "Amount: lowest first" },
  { value: "title-asc", key: "title", dir: 1, label: "Title: A to Z" },
  { value: "category-asc", key: "category", dir: 1, label: "Category: A to Z" },
  { value: "status-asc", key: "status", dir: 1, label: "Status: journey order" },
];

export const EXPENSE_SORT_KEYS: ExpenseSortKey[] = Array.from(
  new Set(EXPENSE_SORT_OPTIONS.map((option) => option.key)),
);

function validStatus(value: string | null): ExpenseStatus | null {
  if (!value) return null;
  return value in STATUS_META ? (value as ExpenseStatus) : null;
}

function validSortKey(value: string | null): ExpenseSortKey | null {
  if (!value) return null;
  return EXPENSE_SORT_KEYS.includes(value as ExpenseSortKey) ? (value as ExpenseSortKey) : null;
}

/** ISO date (yyyy-mm-dd) or null, so a malformed URL never reaches the query. */
function validIsoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Non-negative finite number or null, so "NaN" or "-5" in the URL never reaches the query. */
function validAmount(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Filter state from the query string (ADR-0021). Unknown or malformed values
 * are ignored so a hand-edited or stale URL degrades to the defaults instead
 * of crashing. Returns a fresh object every call; compare with `expenseFilterKey`.
 */
export function parseExpenseSearchParams(searchParams: URLSearchParams | string): ExpenseQuery {
  const params = typeof searchParams === "string" ? new URLSearchParams(searchParams) : searchParams;
  const query: ExpenseQuery = {};

  const q = params.get("q");
  if (q) query.query = q;

  const status = validStatus(params.get("status"));
  if (status) query.filter = status;

  const statuses = Array.from(
    new Set(
      (params.get("statuses") ?? "")
        .split(",")
        .map(validStatus)
        .filter((s): s is ExpenseStatus => s !== null),
    ),
  );
  if (statuses.length > 0) {
    // The chip and the multi-select never intersect (the UI keeps them
    // mutually exclusive); on a stale URL the explicit list wins.
    query.filter = undefined;
    query.statuses = statuses;
  }

  const categories = Array.from(new Set((params.get("cats") ?? "").split(",").map((c) => c.trim()).filter(Boolean)));
  if (categories.length > 0) query.categories = categories;

  const amountMin = validAmount(params.get("min"));
  if (amountMin !== null) query.amountMin = amountMin;
  const amountMax = validAmount(params.get("max"));
  if (amountMax !== null) query.amountMax = amountMax;

  const dateFrom = validIsoDate(params.get("from"));
  if (dateFrom) query.dateFrom = dateFrom;
  const dateTo = validIsoDate(params.get("to"));
  if (dateTo) query.dateTo = dateTo;

  const sortKey = validSortKey(params.get("sort"));
  if (sortKey) query.sortKey = sortKey;
  const dir = params.get("dir");
  if (dir === "asc") query.sortDir = 1;
  else if (dir === "desc") query.sortDir = -1;

  return query;
}

/**
 * The filter state as query params, starting from `current` so unrelated
 * params (e.g. the dashboard's `?claim=` deep link) survive the rewrite.
 * Defaults are omitted so the URL stays clean: All chip, no advanced filters,
 * date sort newest-first.
 */
export function expenseFilterParams(query: ExpenseQuery, current?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(current?.toString() ?? "");
  for (const key of EXPENSE_FILTER_PARAM_KEYS) params.delete(key);

  const q = query.query?.trim();
  if (q) params.set("q", q);
  if (query.filter && query.filter !== "All") params.set("status", query.filter);
  if (query.statuses && query.statuses.length > 0) {
    params.set("statuses", Array.from(new Set(query.statuses)).join(","));
  }
  if (query.categories && query.categories.length > 0) {
    params.set("cats", Array.from(new Set(query.categories)).join(","));
  }
  if (query.amountMin !== undefined) params.set("min", String(query.amountMin));
  if (query.amountMax !== undefined) params.set("max", String(query.amountMax));
  if (query.dateFrom) params.set("from", query.dateFrom);
  if (query.dateTo) params.set("to", query.dateTo);
  if (query.sortKey && query.sortKey !== "date") params.set("sort", query.sortKey);
  if (query.sortDir !== undefined && query.sortDir !== -1) {
    params.set("dir", query.sortDir === 1 ? "asc" : "desc");
  }

  return params;
}

/** Canonical serialization of the filter state, used to detect URL/state divergence. */
export function expenseFilterKey(query: ExpenseQuery): string {
  return expenseFilterParams(query).toString();
}
