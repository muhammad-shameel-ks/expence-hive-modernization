import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { devAuth } from "@/server/auth/dev";
import type { Employee } from "@/server/auth/ports";

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
