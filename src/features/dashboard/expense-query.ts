import type { Expense } from "./mock-data";

export type ExpenseFilter = "All" | "Needs action" | "In progress" | "Paid";
export type ExpenseSortKey = "date" | "amount";

const FILTER_MATCH: Record<Exclude<ExpenseFilter, "All">, (e: Expense) => boolean> = {
  "Needs action": (e) => e.status === "draft" || e.status === "needs-correction",
  "In progress": (e) =>
    e.status === "submitted" || e.status === "in-approval" || e.status === "approved" || e.status === "in-finance",
  Paid: (e) => e.status === "paid",
};

export interface ExpenseQuery {
  query?: string;
  filter?: ExpenseFilter;
  sortKey?: ExpenseSortKey;
  sortDir?: 1 | -1;
}

export function filterAndSortExpenses(expenses: Expense[], options: ExpenseQuery = {}): Expense[] {
  const { query = "", filter = "All", sortKey = "date", sortDir = -1 } = options;
  const q = query.trim().toLowerCase();

  let list = expenses;
  if (filter !== "All") list = list.filter(FILTER_MATCH[filter]);
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
