import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCommands } from "@/server/admin/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { AdminSetup } from "@/features/admin/admin-setup";
import { AppHeader } from "@/components/layout/app-header";
import { devAuth } from "@/server/auth/dev";
import { SUPERADMIN_ROLE_CODE } from "@/server/shared/authorization";
import styles from "../expenses/expenses.module.css";

export default async function AdminPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }

  const admin = adminCommands();
  const actor = await admin.getAdminActor(employee.id);
  if (!actor) {
    redirect("/expenses");
  }
  const isSuperadmin = actor.role?.code === SUPERADMIN_ROLE_CODE;
  const [people, flows, roles, departments, absenceTimeoutDays, heldClaims] = await Promise.all([
    admin.listEmployees(actor.id),
    admin.listFlows(actor.id),
    admin.listRoles(actor.id),
    admin.listDepartments(actor.id),
    isSuperadmin ? admin.getAbsenceTimeoutDays(actor.id) : Promise.resolve(null),
    isSuperadmin ? expenseCommands().listHeldClaims(employee.id) : Promise.resolve([]),
  ]);
  const workspace = await expenseCommands().getWorkspace(employee.id);
  return (
    <main className={styles.page}>
      <AppHeader
        employeeName={workspace.employee.name}
        role={workspace.employee.role}
        activePath="/admin"
      />
      <AdminSetup
        people={people}
        flows={flows}
        roles={roles}
        departments={departments}
        currentEmployeeId={employee.id}
        isSuperadmin={isSuperadmin}
        absenceTimeoutDays={absenceTimeoutDays}
        heldClaims={heldClaims}
      />
    </main>
  );
}
