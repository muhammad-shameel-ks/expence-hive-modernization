import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { AppHeader } from "@/components/layout/app-header";
import { PaymentQueueTable } from "@/features/finance/payment-queue-table";
import styles from "../../expenses/expenses.module.css";

export default async function FinancePaymentsPage() {
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

  let claims;
  try {
    claims = await expenseCommands().listFinancePaymentQueue(employee.id);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      return (
        <main className={styles.page}>
          <AppHeader employeeName={workspace.employee.name} role={workspace.employee.role} />
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Payment queue</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Only Finance can view this page.
            </p>
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
        activePath="/finance/payments"
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / payment queue
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Payment queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Claims at or past Finance verification - awaiting payment, paid, or sent back with a reason.
        </p>

        <div className="mt-8">
          <PaymentQueueTable
            claims={claims}
            employees={workspace.employees}
            currentUserId={workspace.employee.id}
            currentUserRoleId={workspace.employee.role?.id}
          />
        </div>
      </div>
    </main>
  );
}
