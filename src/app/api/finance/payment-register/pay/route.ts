import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { expenseCommands } from "@/server/expenses/dev";
import { handlePaymentRegisterBulkPayRequest } from "@/server/expenses/http";

// The bulk payment run (ADR-0023): pays every eligible claim of the
// submitted batch with individual 'paid' history events and reports the
// skipped rows. The route authenticates the actor; the finance verify/pay
// privilege gate and the per-claim eligibility live in the command.
export async function POST(request: Request) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handlePaymentRegisterBulkPayRequest(request, expenseCommands(), employee.id);
}
