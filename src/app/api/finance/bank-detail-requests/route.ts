import { profileCommands } from "@/server/expenses/dev";
import { handleListPendingBankDetailRequestsRequest } from "@/server/expenses/profile-http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function GET(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleListPendingBankDetailRequestsRequest(request, profileCommands(), employeeId);
}
