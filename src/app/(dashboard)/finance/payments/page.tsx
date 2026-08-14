import { redirect } from "next/navigation";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { requireSessionEmployee } from "@/server/shared/session";
import { PaymentQueueTable } from "@/features/finance/payment-queue-table";
import styles from "../../expenses/expenses.module.css";

export default async function FinancePaymentsPage() {
  const employee = await requireSessionEmployee();

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

  // The payment-register export (ADR-0023) carries each claim's pay-to
  // account: the currently approved bank details, read live at export time
  // (ADR-0024), through the same finance gate as the queue itself.
  const approvedBankDetails = await expenseCommands().listFinanceApprovedBankDetails(
    employee.id,
  );

  return (
    <main className={styles.page}>
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / payment queue
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Payment queue
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Verified claims waiting to be paid. Every stage of every expense lives in the
          organization expense list.
        </p>

        <div className="mt-8">
          <PaymentQueueTable
            claims={claims}
            employees={workspace.employees}
            approvedBankDetails={approvedBankDetails}
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
