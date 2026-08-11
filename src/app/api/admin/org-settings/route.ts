import { adminCommands } from "@/server/admin/dev";
import {
  handleGetAbsenceTimeoutRequest,
  handleSetAbsenceTimeoutRequest,
} from "@/server/admin/http";
import { requireSessionEmployeeId } from "@/server/admin/route-guard";

// Company settings (ADR-0018): the absence auto-skip timeout is read and
// written by Superadmin only - the command layer enforces the admin guard.
export async function GET(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleGetAbsenceTimeoutRequest(request, adminCommands(), employeeId);
}

export async function POST(request: Request) {
  const employeeId = await requireSessionEmployeeId();
  if (typeof employeeId !== "string") return employeeId;
  return handleSetAbsenceTimeoutRequest(request, adminCommands(), employeeId);
}
