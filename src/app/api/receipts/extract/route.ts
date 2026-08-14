import { cookies } from "next/headers";
import { devAuth } from "@/server/auth/dev";
import { createReceiptExtractor } from "@/server/receipts/compose";
import { handleExtractReceiptRequest } from "@/server/receipts/http";

export async function POST(request: Request) {
  const sessionId = (await cookies()).get("eh_session")?.value;
  const employee = sessionId ? devAuth().getCurrentEmployee(sessionId) : null;
  if (!employee) return Response.json({ error: "unauthorized" }, { status: 401 });
  return handleExtractReceiptRequest(request, createReceiptExtractor());
}
