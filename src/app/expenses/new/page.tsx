import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { ExpenseCreateForm } from "@/features/expenses/expense-create-form";
import { AppHeader } from "@/components/layout/app-header";
import styles from "../expenses.module.css";

export default async function NewExpensePage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");
  const workspace = await expenseCommands().getWorkspace(employee.id);

  return (
    <main className={styles.page}>
      <AppHeader employeeName={employee.name} role={workspace.employee.role} />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Expense operations / new claim
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Create an expense
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Start with the receipt, then add only the context your reviewers need.
        </p>
        <div className="mt-8">
          <ExpenseCreateForm />
        </div>
      </div>
    </main>
  );
}
