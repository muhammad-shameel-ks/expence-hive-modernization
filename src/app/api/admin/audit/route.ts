import { adminCommands } from "@/server/admin/dev";
import { handleListAuditRequest } from "@/server/admin/http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function GET(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleListAuditRequest(request, adminCommands(), employeeId);
}
