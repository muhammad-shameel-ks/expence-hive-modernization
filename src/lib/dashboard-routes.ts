export type DashboardPath =
  | "/expenses"
  | "/expenses/all"
  | "/expenses/approvals"
  | "/finance/payments"
  | "/finance/expenses"
  | "/finance/bank-details"
  | "/finance/activity"
  | "/admin"
  | "/profile";

export const DASHBOARD_PAGE_LABELS: Record<DashboardPath, string> = {
  "/expenses": "Dashboard",
  "/expenses/all": "My expenses",
  "/expenses/approvals": "Approvals",
  "/finance/payments": "Payment queue",
  "/finance/expenses": "Expense list",
  "/finance/bank-details": "Bank approvals",
  "/finance/activity": "Activity",
  "/admin": "Admin console",
  "/profile": "Profile",
};

export function activePathFor(pathname: string): DashboardPath | undefined {
  return (Object.keys(DASHBOARD_PAGE_LABELS) as DashboardPath[]).find((path) => path === pathname);
}
