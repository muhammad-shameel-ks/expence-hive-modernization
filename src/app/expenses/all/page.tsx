import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { AppHeader } from "@/components/layout/app-header";
import { FullExpenseList } from "@/features/dashboard/full-expense-list";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import styles from "../expenses.module.css";

export default async function AllExpensesPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }
  const workspace = await expenseCommands().getWorkspace(employee.id);
  const expenses = workspace.claims.map((claim) => claimToExpense(claim, workspace.employees));
  const canViewPaymentQueue = workspace.employee.roleCodes.some((role) => role === "finance-reviewer" || role === "hr");

  return (
    <main className={styles.page}>
      <AppHeader employeeName={employee.name} canViewPaymentQueue={canViewPaymentQueue} />

      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Expense operations / all expenses
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          All expenses
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Search, filter, and sort every claim from submission to payment.
        </p>

        <div className="mt-8">
          <FullExpenseList expenses={expenses} currentUser={employee.name} />
        </div>
      </div>
    </main>
  );
}
