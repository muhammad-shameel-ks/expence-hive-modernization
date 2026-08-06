import { adminCommands } from "@/server/admin/dev";
import { handleDeactivateEmployeeRequest } from "@/server/admin/http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function POST(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleDeactivateEmployeeRequest(request, adminCommands(), employeeId);
}
