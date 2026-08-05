import { isAdminError, type AdminCommands } from "./commands";

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

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

async function handle<T>(
  request: Request,
  parse: (body: unknown) => T | null,
  run: (input: T) => Promise<Response>,
): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (body === null) {
      return invalidBodyResponse();
    }
    const input = parse(body);
    if (input === null) {
      return invalidBodyResponse();
    }
    return await run(input);
  } catch (error) {
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
}

export async function handleAssignRoleRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { employeeId, roleId } = body as { employeeId?: unknown; roleId?: unknown };
      if (typeof employeeId !== "string" || typeof roleId !== "string") return null;
      return { employeeId, roleId };
    },
    async (input) => {
      await commands.assignRole(actorId, input);
      return Response.json({ ok: true });
    },
  );
}

export async function handleAssignDepartmentRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { employeeId, departmentId } = body as { employeeId?: unknown; departmentId?: unknown };
      if (typeof employeeId !== "string" || typeof departmentId !== "string") return null;
      return { employeeId, departmentId };
    },
    async (input) => {
      await commands.assignDepartment(actorId, input);
      return Response.json({ ok: true });
    },
  );
}

export async function handleCreateFlowRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { name, roleId, steps } = body as {
        name?: unknown;
        roleId?: unknown;
        steps?: unknown;
      };
      if (
        typeof name !== "string" ||
        typeof roleId !== "string" ||
        !Array.isArray(steps) ||
        steps.some((step) => typeof step !== "string")
      ) {
        return null;
      }
      return { name, roleId, steps: steps as string[] };
    },
    async (input) => {
      const flow = await commands.createFlow(actorId, input);
      return Response.json({ ok: true, flow }, { status: 201 });
    },
  );
}

export async function handlePublishFlowRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { flowId } = body as { flowId?: unknown };
      if (typeof flowId !== "string") return null;
      return { flowId };
    },
    async (input) => {
      const flow = await commands.publishFlow(actorId, input.flowId);
      return Response.json({ ok: true, flow });
    },
  );
}

export async function handleDeleteFlowRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { flowId } = body as { flowId?: unknown };
      if (typeof flowId !== "string") return null;
      return { flowId };
    },
    async (input) => {
      await commands.deleteFlow(actorId, input.flowId);
      return Response.json({ ok: true });
    },
  );
}

export async function handleCreateDepartmentRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { name } = body as { name?: unknown };
      if (typeof name !== "string") return null;
      return { name };
    },
    async (input) => {
      const department = await commands.createDepartment(actorId, input);
      return Response.json({ ok: true, department }, { status: 201 });
    },
  );
}

export async function handleDeactivateDepartmentRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { departmentId } = body as { departmentId?: unknown };
      if (typeof departmentId !== "string") return null;
      return { departmentId };
    },
    async (input) => {
      await commands.deactivateDepartment(actorId, input.departmentId);
      return Response.json({ ok: true });
    },
  );
}

export async function handleCreateRoleRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { code, displayName, departmentId } = body as {
        code?: unknown;
        displayName?: unknown;
        departmentId?: unknown;
      };
      if (
        typeof code !== "string" ||
        typeof displayName !== "string" ||
        (departmentId !== null && typeof departmentId !== "string")
      ) {
        return null;
      }
      return { code, displayName, departmentId: departmentId ?? null };
    },
    async (input) => {
      const role = await commands.createRole(actorId, input);
      return Response.json({ ok: true, role }, { status: 201 });
    },
  );
}

export async function handleDeactivateRoleRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { roleId } = body as { roleId?: unknown };
      if (typeof roleId !== "string") return null;
      return { roleId };
    },
    async (input) => {
      await commands.deactivateRole(actorId, input.roleId);
      return Response.json({ ok: true });
    },
  );
}
