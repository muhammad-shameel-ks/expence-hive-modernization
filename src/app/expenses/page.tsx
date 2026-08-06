import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Plus, LayoutList } from "lucide-react";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { Button } from "@/components/ui/button";
import styles from "./expenses.module.css";
import { AppHeader } from "@/components/layout/app-header";
import { ExpenseDashboard } from "@/features/dashboard/dashboard";
import { activityEntryToItem, claimToExpense } from "@/features/dashboard/expense-read-model";

export default async function ExpensesPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }
  const [workspace, activityEntries] = await Promise.all([
    expenseCommands().getWorkspace(employee.id),
    expenseCommands().listActivity(employee.id),
  ]);
  const expenses = workspace.claims.map((claim) => claimToExpense(claim, workspace.employees));
  const activity = activityEntries.map(activityEntryToItem);

  return (
    <main className={styles.page}>
      <AppHeader
        employeeName={workspace.employee.name}
        role={workspace.employee.role}
        activePath="/expenses"
      />

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
            expenses={expenses}
            activity={activity}
          />
        </div>
      </div>
    </main>
  );
}
