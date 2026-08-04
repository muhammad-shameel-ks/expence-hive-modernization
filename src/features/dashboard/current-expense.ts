import type { Expense } from "./mock-data";

/** The claim to spotlight on the dashboard: the most recently submitted, still-active expense. */
export function currentExpense(expenses: Expense[]): Expense | null {
  const active = expenses.filter((e) => e.status !== "paid" && e.status !== "rejected");
  if (active.length === 0) return null;

  const submitted = active.filter((e) => e.status !== "draft");
  const pool = submitted.length > 0 ? submitted : active;

  return pool.reduce((newest, candidate) =>
    candidate.submittedAt > newest.submittedAt ? candidate : newest,
  );
}
