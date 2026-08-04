import { cookies } from "next/headers";
import { adminCommands } from "@/server/admin/dev";
import { handleAssignRoleRequest } from "@/server/admin/http";
import { devAuth } from "@/server/auth/dev";

export async function POST(request: Request) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return handleAssignRoleRequest(request, adminCommands(), employee.id);
}
