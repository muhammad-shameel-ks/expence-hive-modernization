import type { AuthCommands } from "./commands";

export async function handleLoginRequest(
  request: Request,
  auth: AuthCommands,
): Promise<Response> {
  const body = (await request.json()) as { email?: string };
  await auth.requestLogin({ email: body.email ?? "" });
  return Response.json({ accepted: true }, { status: 200 });
}

export async function handleVerifyRequest(
  request: Request,
  auth: AuthCommands,
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  try {
    const { sessionId } = await auth.completeLogin({ token });
    const response = redirectTo(url.origin, "/expenses");
    response.headers.append("set-cookie", sessionCookie(sessionId));
    return response;
  } catch {
    return redirectTo(url.origin, "/login?error=invalid-token");
  }
}

export async function handleLogoutRequest(
  request: Request,
  auth: AuthCommands,
): Promise<Response> {
  const sessionId = sessionIdFrom(request);
  if (sessionId) {
    auth.logout(sessionId);
  }
  const response = redirectTo(new URL(request.url).origin, "/login");
  response.headers.append("set-cookie", expiredSessionCookie());
  return response;
}

function redirectTo(origin: string, path: string): Response {
  const location = new URL(path, origin);
  const response = new Response(null, { status: 303 });
  response.headers.set("location", location.toString());
  return response;
}

function sessionIdFrom(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "eh_session" && rest.length > 0) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function sessionCookie(sessionId: string): string {
  return `eh_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function expiredSessionCookie(): string {
  return `eh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}