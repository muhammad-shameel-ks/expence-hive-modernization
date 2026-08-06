import type { Expense } from "./mock-data";

export interface DashboardStats {
  spentThisMonth: number;
  spentThisMonthCount: number;
  pendingApproval: number;
  rejected: number;
  reimbursedThisMonth: number;
}

export function dashboardStats(expenses: Expense[], month: string): DashboardStats {
  const inMonth = (e: Expense) => e.submittedAt.startsWith(month);

  let spentThisMonth = 0;
  let spentThisMonthCount = 0;
  let pendingApproval = 0;
  let rejected = 0;
  let reimbursedThisMonth = 0;

  for (const expense of expenses) {
    if (
      expense.status === "submitted" ||
      expense.status === "in-approval" ||
      expense.status === "in-finance"
    ) {
      pendingApproval += 1;
    }
    if (expense.status === "rejected") {
      rejected += 1;
    }
    if (!inMonth(expense)) continue;
    if (expense.status === "paid") {
      reimbursedThisMonth += expense.amount;
    }
    if (expense.status !== "draft") {
      spentThisMonth += expense.amount;
      spentThisMonthCount += 1;
    }
  }

  return { spentThisMonth, spentThisMonthCount, pendingApproval, rejected, reimbursedThisMonth };
}
