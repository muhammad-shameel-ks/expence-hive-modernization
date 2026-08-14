import { profileCommands } from "@/server/expenses/dev";
import { handleSubmitBankDetailChangeRequest } from "@/server/expenses/profile-http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

export async function POST(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleSubmitBankDetailChangeRequest(request, profileCommands(), employeeId);
}
