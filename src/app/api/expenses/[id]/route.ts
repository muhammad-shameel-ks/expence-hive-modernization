import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import {
  handleDeleteExpenseRequest,
  handleGetExpenseRequest,
  handleUpdateExpenseRequest,
} from "@/server/expenses/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleGetExpenseRequest(request, expenseCommands(), employee.id, id);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleUpdateExpenseRequest(request, expenseCommands(), employee.id, id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleDeleteExpenseRequest(request, expenseCommands(), employee.id, id);
}
