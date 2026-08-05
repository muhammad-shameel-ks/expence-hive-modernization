import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";

// Shared by every route under src/app/api/admin/*: resolve the dev session
// cookie to an employee id, or hand back the 401 response for the route to
// return as-is.
export async function requireSessionEmployeeId(): Promise<string | Response> {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return employee.id;
}
