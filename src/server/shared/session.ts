import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import type { Employee } from "@/server/auth/ports";
import { expenseCommands } from "@/server/expenses/dev";
import { isExpenseError, type ExpenseCommands } from "@/server/expenses/commands";

type ExpenseWorkspace = Awaited<ReturnType<ExpenseCommands["getWorkspace"]>>;

// Deduped per request (React.cache): the dashboard layout and each page it
// wraps both need the workspace, and without this they'd each trigger their
// own getWorkspace call for the same employee within the same render pass.
const cachedGetWorkspace = cache((employeeId: string) => expenseCommands().getWorkspace(employeeId));

const SESSION_COOKIE_NAME = "eh_session";

// Redirects unauthenticated requests to /login instead of returning null, so
// every caller (layout and pages alike) gets the same gate for free.
export async function requireSessionEmployee(): Promise<Employee> {
  const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    redirect("/login");
  }
  return employee;
}

// A deactivated employee still holds a session but is rejected by the
// expense domain; send them back to sign-in instead of crashing.
export async function getWorkspaceOrRedirect(employeeId: string): Promise<ExpenseWorkspace> {
  try {
    return await cachedGetWorkspace(employeeId);
  } catch (error) {
    if (isExpenseError(error) && error.code === "unauthorized") {
      redirect("/login");
    }
    throw error;
  }
}
