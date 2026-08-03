import { devAuth } from "@/server/auth/dev";
import { handleVerifyRequest } from "@/server/auth/http";

export async function GET(request: Request) {
  return handleVerifyRequest(request, devAuth());
}