import { isAdminError, type AdminCommands } from "./commands";
import type { AdminRole } from "./ports";

export function adminErrorResponse(error: { code: string }): Response {
  const status =
    error.code === "unauthorized" ? 403 : error.code === "not-found" ? 404 : 422;
  return Response.json({ error: error.code }, { status });
}

export function internalErrorResponse(): Response {
  return Response.json({ error: "internal" }, { status: 500 });
}

function handleUnexpectedError(error: unknown): Response {
  console.error("admin command failed", error);
  return internalErrorResponse();
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
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
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
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
}
