import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import { OrgWideExpenseList } from "@/features/finance/org-wide-expense-list";
import styles from "../../expenses/expenses.module.css";

export default async function FinanceExpensesPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");

  let workspace;
  try {
    workspace = await expenseCommands().getWorkspace(employee.id);
  } catch (error) {
    // A deactivated employee still holds a session but is rejected by the
    // expense domain; send them back to sign-in instead of crashing.
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }

  let expenses;
  try {
    // The org-wide list (ADR-0023): every claim in the organization at every
    // stage, gated on the view-org-wide-activity privilege. Read-only.
    const claims = await expenseCommands().listOrganizationClaims(employee.id);
    expenses = claims.map((claim) => claimToExpense(claim, workspace.employees));
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      return (
        <main className={styles.page}>
          <AppHeader employeeName={workspace.employee.name} role={workspace.employee.role} />
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Expense list</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Only roles with the view-org-wide-activity privilege can view this page.
            </p>
            <div className="mt-6">
              <Button asChild variant="outline">
                <Link href="/finance/payments">Back to payment queue</Link>
              </Button>
            </div>
          </div>
        </main>
      );
    }
    throw error;
  }

  return (
    <main className={styles.page}>
      <AppHeader
        employeeName={workspace.employee.name}
        role={workspace.employee.role}
        activePath="/finance/expenses"
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / expense list
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Expense list
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every claim in the organization at every stage - draft, submitted, in approval,
          in finance, paid, or rejected.
        </p>

        <div className="mt-8">
          <OrgWideExpenseList
            expenses={expenses}
            employees={workspace.employees}
            currentUser={workspace.employee.name}
            currentUserId={workspace.employee.id}
            currentUserRoleId={workspace.employee.role?.id}
            currentUserRoleCode={workspace.employee.role?.code}
          />
        </div>
      </div>
    </main>
  );
}
