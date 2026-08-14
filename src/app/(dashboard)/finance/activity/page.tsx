import Link from "next/link";
import { redirect } from "next/navigation";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { requireSessionEmployee } from "@/server/shared/session";
import { Button } from "@/components/ui/button";
import { activityEntryToItem } from "@/features/dashboard/expense-read-model";
import { OrganizationActivity } from "@/features/finance/organization-activity";
import styles from "../../expenses/expenses.module.css";

export default async function OrganizationActivityPage() {
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

  let activity;
  try {
    activity = (await expenseCommands().listOrganizationActivity(employee.id)).map(activityEntryToItem);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      return (
        <main className={styles.page}>
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Organization activity</h1>
            <p className="mt-4 text-sm text-muted-foreground">Only Finance Head can view this page.</p>
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
          Finance / organization activity
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Organization activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every approval, rejection, verification, payment, delegation, and comment made across the organization.
        </p>

        <div className="mt-8">
          <OrganizationActivity
            items={activity}
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
