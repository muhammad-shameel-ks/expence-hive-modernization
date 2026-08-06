import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError } from "@/server/expenses/commands";
import { AppHeader } from "@/components/layout/app-header";
import { activityEntryToItem } from "@/features/dashboard/expense-read-model";
import { OrganizationActivity } from "@/features/finance/organization-activity";
import styles from "../../expenses/expenses.module.css";

export default async function OrganizationActivityPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) redirect("/login");

  const workspace = await expenseCommands().getWorkspace(employee.id);

  let activity;
  try {
    activity = (await expenseCommands().listOrganizationActivity(employee.id)).map(activityEntryToItem);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      return (
        <main className={styles.page}>
          <AppHeader employeeName={workspace.employee.name} role={workspace.employee.role} />
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">Organization activity</h1>
            <p className="mt-4 text-sm text-muted-foreground">Only Finance Head can view this page.</p>
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
        activePath="/finance/activity"
      />
      <div className="mx-auto w-full max-w-7xl px-4 py-10 pb-32 sm:px-6 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Finance / organization activity
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Organization activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Every approval, rejection, verification, payment, takeover, and comment made across the organization.
        </p>

        <div className="mt-8">
          <OrganizationActivity
            items={activity}
            currentUser={workspace.employee.name}
            currentUserId={workspace.employee.id}
          />
        </div>
      </div>
    </main>
  );
}
