import { AdminError, type AdminCommands } from "./commands";
import type { AdminRole } from "./ports";

export function adminErrorResponse(error: AdminError): Response {
  const status = error.code === "unauthorized" ? 403 : error.code === "not-found" ? 404 : 422;
  return Response.json({ error: error.code }, { status });
}

export async function handleAssignRoleRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = (await request.json()) as { employeeId?: unknown; role?: unknown };
    if (typeof body.employeeId !== "string" || typeof body.role !== "string") {
      return Response.json({ error: "validation" }, { status: 422 });
    }
    await commands.assignRole(actorId, {
      employeeId: body.employeeId,
      role: body.role as AdminRole,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminError) {
      return adminErrorResponse(error);
    }
    throw error;
  }
}

export async function handleCreateFlowRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      scope?: unknown;
      steps?: unknown;
    };
    if (
      typeof body.name !== "string" ||
      typeof body.scope !== "string" ||
      !Array.isArray(body.steps) ||
      body.steps.some((step) => typeof step !== "string")
    ) {
      return Response.json({ error: "validation" }, { status: 422 });
    }
    const flow = await commands.createFlowDraft(actorId, {
      name: body.name,
      scope: body.scope,
      steps: body.steps as AdminRole[],
    });
    return Response.json({ ok: true, flow }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminError) {
      return adminErrorResponse(error);
    }
    throw error;
  }
}
