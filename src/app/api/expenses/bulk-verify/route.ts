import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handleBulkVerifyExpensesRequest } from "@/server/expenses/http";

export async function POST(request: Request) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handleBulkVerifyExpensesRequest(request, expenseCommands(), employee.id);
}
