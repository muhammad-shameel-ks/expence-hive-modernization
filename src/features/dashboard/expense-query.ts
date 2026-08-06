import { STATUS_META, type Expense, type ExpenseStatus } from "./mock-data";

export type ExpenseFilter = "All" | "Needs action" | "In progress" | "Paid";
export type ExpenseSortKey = "date" | "amount" | "title" | "category" | "status";

const FILTER_MATCH: Record<Exclude<ExpenseFilter, "All">, (e: Expense) => boolean> = {
  "Needs action": (e) => e.status === "draft",
  "In progress": (e) =>
    e.status === "submitted" || e.status === "in-approval" || e.status === "approved" || e.status === "in-finance",
  Paid: (e) => e.status === "paid",
};

/** Journey order, draft to paid/rejected — used to rank the status sort. */
const STATUS_RANK: Record<ExpenseStatus, number> = Object.fromEntries(
  Object.keys(STATUS_META).map((status, i) => [status, i]),
) as Record<ExpenseStatus, number>;

export interface ExpenseQuery {
  query?: string;
  /** Quick status-group chip (All / Needs action / In progress / Paid). */
  filter?: ExpenseFilter;
  /** Exact-status multi-select, layered on top of `filter`. */
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
