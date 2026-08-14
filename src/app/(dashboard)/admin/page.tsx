import { redirect } from "next/navigation";
import { adminCommands } from "@/server/admin/dev";
import { AdminSetup } from "@/features/admin/admin-setup";
import { requireSessionEmployee } from "@/server/shared/session";
import { SUPERADMIN_ROLE_CODE } from "@/server/shared/authorization";
import styles from "../expenses/expenses.module.css";

export default async function AdminPage() {
  const employee = await requireSessionEmployee();

  const admin = adminCommands();
  const actor = await admin.getAdminActor(employee.id);
  if (!actor) {
    redirect("/expenses");
  }
  const isSuperadmin = actor.role?.code === SUPERADMIN_ROLE_CODE;
  const [people, flows, roles, departments, absenceTimeoutDays] = await Promise.all([
    admin.listEmployees(actor.id),
    admin.listFlows(actor.id),
    admin.listRoles(actor.id),
    admin.listDepartments(actor.id),
    isSuperadmin ? admin.getAbsenceTimeoutDays(actor.id) : Promise.resolve(null),
  ]);
  return (
    <main className={styles.page}>
      <AdminSetup
        people={people}
        flows={flows}
        roles={roles}
        departments={departments}
        currentEmployeeId={employee.id}
        isSuperadmin={isSuperadmin}
        absenceTimeoutDays={absenceTimeoutDays}
      />
    </main>
  );
}
