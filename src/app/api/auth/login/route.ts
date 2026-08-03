import { devAuth } from "@/server/auth/dev";
import { handleLoginRequest } from "@/server/auth/http";

export async function POST(request: Request) {
  return handleLoginRequest(request, devAuth());
}