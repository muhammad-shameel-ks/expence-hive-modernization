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
  console.error(
    "admin command failed",
    error instanceof Error ? error : String(error),
  );
  return internalErrorResponse();
}

function invalidBodyResponse(): Response {
  return Response.json({ error: "validation" }, { status: 422 });
}

export async function handleAssignRoleRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (body === null) {
      return invalidBodyResponse();
    }
    const { employeeId, role } = body as { employeeId?: unknown; role?: unknown };
    if (typeof employeeId !== "string" || typeof role !== "string") {
      return invalidBodyResponse();
    }
    await commands.assignRole(actorId, {
      employeeId,
      role: role as AdminRole,
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
    const body = await readJsonBody(request);
    if (body === null) {
      return invalidBodyResponse();
    }
    const { name, scope, steps } = body as {
      name?: unknown;
      scope?: unknown;
      steps?: unknown;
    };
    if (
      typeof name !== "string" ||
      typeof scope !== "string" ||
      !Array.isArray(steps) ||
      steps.some((step) => typeof step !== "string")
    ) {
      return invalidBodyResponse();
    }
    const flow = await commands.createFlowDraft(actorId, {
      name,
      scope,
      steps: steps as AdminRole[],
    });
    return Response.json({ ok: true, flow }, { status: 201 });
  } catch (error) {
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
