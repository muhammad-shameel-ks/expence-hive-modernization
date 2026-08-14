import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { profileCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { isExpenseAuthError } from "@/server/expenses/profile-http";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { BankDetailApprovals } from "@/features/finance/bank-detail-approvals";
import styles from "../../expenses/expenses.module.css";

export default async function FinanceBankDetailsPage() {
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

  let requests;
  try {
    requests = await profileCommands().listPendingBankDetailChanges(employee.id);
  } catch (error) {
    if (isExpenseAuthError(error)) {
      return (
        <main className={styles.page}>
          <AppHeader employeeName={workspace.employee.name} role={workspace.employee.role} />
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
              Bank-detail approvals
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Only roles with the approve bank detail changes privilege can review bank-detail
              requests.
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
        activePath="/finance/bank-details"
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / bank-detail approvals
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Bank-detail approvals
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Pending bank-details changes, with the currently approved account beside the requested
          one. Approving activates the new account; rejecting keeps the current one.
        </p>

        <div className="mt-8">
          <BankDetailApprovals currentUserId={employee.id} initialRequests={requests} />
        </div>
      </div>
    </main>
  );
}
