import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { ExpenseCreateForm, type ExpenseDraftInitial } from "@/features/expenses/expense-create-form";
import { AppHeader } from "@/components/layout/app-header";
import styles from "../expenses.module.css";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");
  const commands = expenseCommands();
  let workspace;
  try {
    workspace = await commands.getWorkspace(employee.id);
  } catch (error) {
    // A deactivated employee still holds a session but is rejected by the
    // expense domain; send them back to sign-in instead of crashing.
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }

  const params = await searchParams;
  let initial: ExpenseDraftInitial | null = null;
  if (params.id) {
    try {
      const claim = await commands.getClaim(employee.id, params.id);
      // Only the requester's own drafts can be continued from here; any
      // other claim state or owner falls back to the dashboard.
      if (claim.status !== "draft" || claim.requesterId !== employee.id) redirect("/expenses");
      initial = {
        claimId: claim.id,
        title: claim.title,
        category: claim.category,
        subCategory: claim.subCategory,
        remark: claim.remark,
        amount: (claim.amountMinor / 100).toFixed(2),
        expenseDate: claim.expenseDate,
        accountNumber: claim.payoutDetails?.accountNumber ?? "",
        ifscCode: claim.payoutDetails?.ifscCode ?? "",
        receiptFileName: claim.attachment?.fileName,
      };
    } catch (error) {
      if (isExpenseError(error) && (error.code === "not-found" || error.code === "unauthorized")) {
        redirect("/expenses");
      }
      throw error;
    }
  }

  return (
    <main className={styles.page}>
      <AppHeader employeeName={workspace.employee.name} role={workspace.employee.role} />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Expense operations / {initial ? "continue draft" : "new claim"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {initial ? "Continue your expense draft" : "Create an expense"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {initial
            ? "Pick up where you left off. Changes are saved back to the same draft."
            : "Start with the receipt, then add only the context your reviewers need."}
        </p>
        <div className="mt-8">
          <ExpenseCreateForm initial={initial} />
        </div>
      </div>
    </main>
  );
}
