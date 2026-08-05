import { adminCommands } from "@/server/admin/dev";
import { handleDeactivateDepartmentRequest } from "@/server/admin/http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function POST(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleDeactivateDepartmentRequest(request, adminCommands(), employeeId);
}
