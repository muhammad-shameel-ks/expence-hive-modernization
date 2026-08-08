import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handleGetExpenseSummaryRequest } from "@/server/expenses/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleGetExpenseSummaryRequest(request, expenseCommands(), employee.id, id);
}
