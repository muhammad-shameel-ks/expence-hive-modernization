import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handleDelegateExpenseRequest } from "@/server/expenses/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  // Delegation is a Superadmin-only built-in (ADR-0015/0017): the command
  // layer enforces the gate and returns 403 for any other role.
  const { id } = await params;
  return handleDelegateExpenseRequest(request, expenseCommands(), employee.id, id);
}
