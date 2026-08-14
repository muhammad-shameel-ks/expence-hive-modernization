import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Plus, LayoutList } from "lucide-react";
import { getWorkspaceOrRedirect, requireSessionEmployee } from "@/server/shared/session";
import { expenseCommands, expenseDevStore } from "@/server/expenses/dev";
import { adminDevStore } from "@/server/admin/dev";
import { isExpenseError } from "@/server/expenses/commands";
import {
  createDashboardReadModels,
  DASHBOARD_PERIOD_COOKIE,
  dashboardViewForRole,
  parseDashboardPeriod,
} from "@/server/expenses/dashboard-read-models";
import { Button } from "@/components/ui/button";
import styles from "./expenses.module.css";
import { ExpenseDashboard } from "@/features/dashboard/dashboard";
import { activityEntryToItem, claimToExpense } from "@/features/dashboard/expense-read-model";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string }>;
}) {
  const employee = await requireSessionEmployee();
  const { claim: focusClaimId } = await searchParams;
  // The persisted period preference (ADR-0020): the switch writes the cookie
  // client-side and refreshes the route, so this server read recomputes the
  // cards, the claims list, and the activity feed together.
  const period = parseDashboardPeriod((await cookies()).get(DASHBOARD_PERIOD_COOKIE)?.value);
  const workspace = await getWorkspaceOrRedirect(employee.id);
  let activityEntries;
  let focusClaim;
  try {
    activityEntries = await expenseCommands().listActivity(employee.id);
    // The focusClaim deep-link (e.g. ?claim= from the admin console)
    // resolves the claim server-side so the dashboard can open it on mount.
    focusClaim = focusClaimId
      ? await expenseCommands().getClaim(employee.id, focusClaimId).catch(() => null)
      : null;
  } catch (error) {
    // A deactivated employee still holds a session but is rejected by the
    // expense domain; send them back to sign-in instead of crashing.
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }
  const view = dashboardViewForRole(workspace.employee.role);
  // Role-scoped aggregates (ADR-0020): computed server-side from org-level
  // claim data through the expense store, never by re-filtering the
  // viewer's workspace list in the client.
  const { cards, absenceTimeoutDays } = await createDashboardReadModels({
    store: expenseDevStore(),
    absenceTimeout: adminDevStore(),
  }).cards(view, period, new Date(), workspace.employee);
  const expenses = workspace.claims.map((claim) => claimToExpense(claim, workspace.employees));
  const activity = activityEntries.map(activityEntryToItem);

  return (
    <main className={styles.page}>
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Expense operations / dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Expense dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Track every claim from submission to payment — and see exactly who is holding the ball.
            </p>
          </div>

          <div className="flex shrink-0 gap-3">
            <Button variant="outline" className="gap-1.5" asChild>
              <a href="/expenses/all">
                <LayoutList className="h-4 w-4" />
                View expenses
              </a>
            </Button>
            <Button className="gap-1.5" asChild>
              <a href="/expenses/new">
                <Plus className="h-4 w-4" />
                New expense
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-8">
          <ExpenseDashboard
            currentUser={workspace.employee.name}
            currentUserId={workspace.employee.id}
            currentUserRoleId={workspace.employee.role?.id}
            currentUserRoleCode={workspace.employee.role?.code}
            cards={cards}
            absenceTimeoutDays={absenceTimeoutDays}
            period={period}
            expenses={expenses}
            activity={activity}
            focusClaim={focusClaim ? claimToExpense(focusClaim, workspace.employees) : undefined}
          />
        </div>
      </div>
    </main>
  );
}
