import { devAuth } from "@/server/auth/dev";
import { handleLogoutRequest } from "@/server/auth/http";

export async function POST(request: Request) {
  return handleLogoutRequest(request, devAuth());
}