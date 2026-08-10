import type { Expense } from "./mock-data";

export interface DashboardStats {
  spentThisMonth: number;
  spentThisMonthCount: number;
  pendingApproval: number;
  rejected: number;
  reimbursedThisMonth: number;
}

// The money stats are the viewer's own spend: the workspace list also
// carries pool claims (in-finance claims the viewer's role can verify), so
// those must never count as money the viewer spent. Rejected claims are also
// viewer-scoped via isMine, while pending remains list-scoped to reflect claims
// awaiting attention across the workspace list.
export function dashboardStats(
  expenses: Expense[],
  month: string,
  currentUserId?: string,
): DashboardStats {
  const inMonth = (e: Expense) => e.submittedAt.startsWith(month);
  const isMine = (e: Expense) => !currentUserId || e.requesterId === currentUserId;

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
    if (expense.status === "rejected" && isMine(expense)) {
      rejected += 1;
    }
    if (!inMonth(expense) || !isMine(expense)) continue;
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
