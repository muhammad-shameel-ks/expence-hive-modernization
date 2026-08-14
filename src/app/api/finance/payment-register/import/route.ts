import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handlePaymentRegisterImportRequest } from "@/server/expenses/http";

// The drag-back import (ADR-0023): finance drops the exported register
// Excel onto the payments tab, the file is parsed HERE on the server (never
// in the browser), and the matching claims come back for auto-selection.
export async function POST(request: Request) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handlePaymentRegisterImportRequest(request, expenseCommands(), employee.id);
}
