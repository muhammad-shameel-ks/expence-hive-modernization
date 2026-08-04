import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCommands } from "@/server/admin/dev";
import { AdminSetup } from "@/features/admin/admin-setup";
import { devAuth } from "@/server/auth/dev";

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
  const [people, flows] = await Promise.all([
    admin.listEmployees(actor.id),
    admin.listFlows(actor.id),
  ]);
  return <AdminSetup people={people} flows={flows} operatorName={employee.name} />;
}
