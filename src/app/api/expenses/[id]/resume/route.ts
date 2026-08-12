import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handleResumeExpenseRequest } from "@/server/expenses/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleResumeExpenseRequest(request, expenseCommands(), employee.id, id);
}
