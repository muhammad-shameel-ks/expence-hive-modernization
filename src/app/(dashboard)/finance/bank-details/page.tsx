import Link from "next/link";
import { profileCommands } from "@/server/expenses/dev";
import { isExpenseAuthError } from "@/server/expenses/profile-http";
import { getWorkspaceOrRedirect, requireSessionEmployee } from "@/server/shared/session";
import { Button } from "@/components/ui/button";
import { BankDetailApprovals } from "@/features/finance/bank-detail-approvals";
import styles from "../../expenses/expenses.module.css";

export default async function FinanceBankDetailsPage() {
  const employee = await requireSessionEmployee();
  await getWorkspaceOrRedirect(employee.id);

  let requests;
  try {
    requests = await profileCommands().listPendingBankDetailChanges(employee.id);
  } catch (error) {
    if (isExpenseAuthError(error)) {
      return (
        <main className={styles.page}>
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
