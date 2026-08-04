import type { Expense } from "./mock-data";

export interface DashboardStats {
  spentThisMonth: number;
  spentThisMonthCount: number;
  pendingApproval: number;
  needsCorrection: number;
  reimbursedThisMonth: number;
}

export function dashboardStats(expenses: Expense[], month: string): DashboardStats {
  const inMonth = (e: Expense) => e.submittedAt.startsWith(month);

  let spentThisMonth = 0;
  let spentThisMonthCount = 0;
  let pendingApproval = 0;
  let needsCorrection = 0;
  let reimbursedThisMonth = 0;

  for (const expense of expenses) {
    if (expense.status === "submitted" || expense.status === "in-approval") {
      pendingApproval += 1;
    }
    if (expense.status === "needs-correction") {
      needsCorrection += 1;
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

  return { spentThisMonth, spentThisMonthCount, pendingApproval, needsCorrection, reimbursedThisMonth };
}
