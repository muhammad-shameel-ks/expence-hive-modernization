import { adminCommands } from "@/server/admin/dev";
import { handleGetRoleCapabilityImpactRequest } from "@/server/admin/http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function POST(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleGetRoleCapabilityImpactRequest(request, adminCommands(), employeeId);
}
