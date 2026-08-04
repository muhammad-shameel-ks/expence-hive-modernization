import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCommands } from "@/server/admin/dev";
import { AdminError } from "@/server/admin/commands";
import type { AdminEmployee, FlowDraft } from "@/server/admin/ports";
import { AdminSetup } from "@/features/admin/admin-setup";
import { devAuth } from "@/server/auth/dev";

export default async function AdminPage() {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }

  const admin = adminCommands();
  let people: AdminEmployee[];
  let flows: FlowDraft[];
  try {
    [people, flows] = await Promise.all([
      admin.listEmployees(employee.id),
      admin.listFlows(employee.id),
    ]);
  } catch (error) {
    if (error instanceof AdminError && error.code === "unauthorized") {
      redirect("/expenses");
    }
    throw error;
  }
  return <AdminSetup people={people} flows={flows} operatorName={employee.name} />;
}
