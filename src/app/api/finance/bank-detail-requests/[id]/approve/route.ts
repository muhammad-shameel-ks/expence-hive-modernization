import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { profileCommands } from "@/server/expenses/dev";
import { handleApproveBankDetailRequest } from "@/server/expenses/profile-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return handleApproveBankDetailRequest(request, profileCommands(), employee.id, id);
}
