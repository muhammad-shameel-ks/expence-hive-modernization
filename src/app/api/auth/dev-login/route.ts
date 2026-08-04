import { devAuth } from "@/server/auth/dev";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not-found" }, { status: 404 });
  const body = (await request.json()) as { employeeId?: unknown };
  if (typeof body.employeeId !== "string") return Response.json({ error: "validation" }, { status: 422 });
  try {
    const sessionId = devAuth().createDevSession(body.employeeId);
    const response = new Response(null, { status: 303, headers: { location: new URL("/expenses", request.url).toString() } });
    response.headers.set("set-cookie", `eh_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`);
    return response;
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 403 });
  }
}
