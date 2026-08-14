import Link from "next/link";
import { redirect } from "next/navigation";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { resolveRoleCapabilities } from "@/server/shared/authorization";
import { getWorkspaceOrRedirect, requireSessionEmployee } from "@/server/shared/session";
import { Button } from "@/components/ui/button";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import { ApprovalsInboxTable } from "@/features/approvals/approvals-inbox-table";
import styles from "../expenses.module.css";

export default async function ApprovalsPage() {
  const employee = await requireSessionEmployee();
  const workspace = await getWorkspaceOrRedirect(employee.id);

  const capabilities = resolveRoleCapabilities(workspace.employee.role);
  if (!capabilities.canApprove && !capabilities.canAccessFinance) {
    return (
      <main className={styles.page}>
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Approvals inbox
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Only managers and finance approvers can access the approvals inbox.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/expenses">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  let rawClaims;
  let employees;
  try {
    [rawClaims, employees] = await Promise.all([
      expenseCommands().listApprovalsQueue(employee.id),
      expenseCommands().listEmployees(employee.id),
    ]);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }

  const expenses = rawClaims.map((claim) => claimToExpense(claim, employees));

  return (
    <main className={styles.page}>
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Expense operations / approvals
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Approvals inbox
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Review, filter, and approve expense claims from your department and organization in bulk.
        </p>

        <div className="mt-8">
          <ApprovalsInboxTable
            expenses={expenses}
            employees={employees}
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
