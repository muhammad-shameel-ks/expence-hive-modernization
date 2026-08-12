import { isAdminError, parseRoleCapabilities, type AdminCommands } from "./commands";
import type { AuditFilter, FlowStepInput } from "./ports";
import { GUARD_OPERATORS, type AmountGuardOperator } from "../shared/amount-guard";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBareDate(value: string): boolean {
  if (!BARE_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  // new Date overflows invalid days (e.g. 2026-02-30 parses to Mar 2), so
  // require the parsed date to round-trip to the exact input.
  return date.toISOString().slice(0, 10) === value;
}

export function adminErrorResponse(error: { code: string; impact?: unknown }): Response {
  const status =
    error.code === "unauthorized"
      ? 403
      : error.code === "not-found"
        ? 404
        : error.code === "conflict"
          ? 409
          : 422;
  return Response.json({ error: error.code, impact: error.impact }, { status });
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
    return await request.json();
  } catch {
    return null;
  }
}

// Steps arrive as either { kind: 'role', roleId } or { kind: 'team-lead' },
// optionally with an amount guard { operator, amountMinor } on any step.
// The team-lead shape intentionally ignores any stray roleId field: the
// command layer rejects a team-lead step that carries one with a clear
// validation error.
function parseFlowSteps(value: unknown): FlowStepInput[] | null {
  if (!Array.isArray(value)) return null;
  const steps: FlowStepInput[] = [];
  for (const step of value) {
    if (typeof step !== "object" || step === null) return null;
    const candidate = step as { kind?: unknown; roleId?: unknown; guard?: unknown };
    const guard = parseGuard(candidate.guard);
    if (guard === false) return null;
    if (candidate.kind === "team-lead") {
      steps.push({ kind: "team-lead", guard });
      continue;
    }
    if (candidate.kind === "role" && typeof candidate.roleId === "string") {
      steps.push({ kind: "role", roleId: candidate.roleId, guard });
      continue;
    }
    return null;
  }
  return steps;
}

// The guard is validated by the command layer; this boundary only shapes it.
// Absent/null means no condition; false means a malformed guard.
function parseGuard(value: unknown): FlowStepInput["guard"] | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return false;
  const candidate = value as { operator?: unknown; amountMinor?: unknown };
  const operator = candidate.operator;
  if (typeof operator !== "string" || !GUARD_OPERATORS.includes(operator as AmountGuardOperator)) {
    return false;
  }
  if (typeof candidate.amountMinor !== "number" || !Number.isInteger(candidate.amountMinor)) {
    return false;
  }
  return { operator: operator as AmountGuardOperator, amountMinor: candidate.amountMinor };
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
      if (typeof name !== "string" || typeof roleId !== "string") {
        return null;
      }
      const parsedSteps = parseFlowSteps(steps);
      if (parsedSteps === null) return null;
      return { name, roleId, steps: parsedSteps };
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

export async function handleUpdateFlowRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { flowId, name, roleId, steps } = body as {
        flowId?: unknown;
        name?: unknown;
        roleId?: unknown;
        steps?: unknown;
      };
      if (typeof flowId !== "string" || typeof name !== "string" || typeof roleId !== "string") {
        return null;
      }
      const parsedSteps = parseFlowSteps(steps);
      if (parsedSteps === null) return null;
      return { flowId, name, roleId, steps: parsedSteps };
    },
    async (input) => {
      const flow = await commands.updateFlow(actorId, input.flowId, {
        name: input.name,
        roleId: input.roleId,
        steps: input.steps,
      });
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
      const { name, headId } = body as { name?: unknown; headId?: unknown };
      if (typeof name !== "string" || typeof headId !== "string") return null;
      return { name, headId };
    },
    async (input) => {
      const department = await commands.createDepartment(actorId, input);
      return Response.json({ ok: true, department }, { status: 201 });
    },
  );
}

export async function handleSetDepartmentHeadRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { departmentId, headId } = body as { departmentId?: unknown; headId?: unknown };
      if (typeof departmentId !== "string" || typeof headId !== "string") return null;
      return { departmentId, headId };
    },
    async (input) => {
      await commands.setDepartmentHead(actorId, input);
      return Response.json({ ok: true });
    },
  );
}

export async function handleCreateEmployeeRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { name, email, roleId, departmentId, managerId } = body as {
        name?: unknown;
        email?: unknown;
        roleId?: unknown;
        departmentId?: unknown;
        managerId?: unknown;
      };
      if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof roleId !== "string" ||
        typeof departmentId !== "string"
      ) {
        return null;
      }
      if (managerId !== undefined && managerId !== null && typeof managerId !== "string") {
        return null;
      }
      return {
        name,
        email,
        roleId,
        departmentId,
        managerId: (managerId as string | null | undefined) ?? null,
      };
    },
    async (input) => {
      const employee = await commands.createEmployee(actorId, input);
      return Response.json({ ok: true, employee }, { status: 201 });
    },
  );
}

export async function handleBulkImportEmployeesRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (body === null) {
      return invalidBodyResponse();
    }
    const { csv } = body as { csv?: unknown };
    if (typeof csv !== "string") {
      return invalidBodyResponse();
    }
    const result = await commands.importEmployees(actorId, { csv });
    if (result.failed.length > 0) {
      // All-or-nothing: the import was refused, and the per-row failures
      // tell the console exactly which rows were wrong and why.
      return Response.json({ error: "validation", result }, { status: 422 });
    }
    return Response.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
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
      const { code, displayName, capabilities } = body as {
        code?: unknown;
        displayName?: unknown;
        capabilities?: unknown;
      };
      if (typeof code !== "string" || typeof displayName !== "string") {
        return null;
      }
      // Custom roles are created with a privilege set (ADR-0015); an
      // absent set falls back to the submit-only default, a malformed one
      // is rejected here rather than half-written to the store.
      const parsedCapabilities =
        capabilities === undefined || capabilities === null
          ? undefined
          : parseRoleCapabilities(capabilities);
      if (capabilities !== undefined && capabilities !== null && !parsedCapabilities) {
        return null;
      }
      return { code, displayName, capabilities: parsedCapabilities ?? undefined };
    },
    async (input) => {
      const role = await commands.createRole(actorId, input);
      return Response.json({ ok: true, role }, { status: 201 });
    },
  );
}

export async function handleUpdateRoleCapabilitiesRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { roleId, capabilities, confirmed } = body as {
        roleId?: unknown;
        capabilities?: unknown;
        confirmed?: unknown;
      };
      if (typeof roleId !== "string") return null;
      const parsedCapabilities = parseRoleCapabilities(capabilities);
      if (!parsedCapabilities) return null;
      if (confirmed !== undefined && typeof confirmed !== "boolean") return null;
      return { roleId, capabilities: parsedCapabilities, confirmed: confirmed === true };
    },
    async (input) => {
      const result = await commands.updateRoleCapabilities(
        actorId,
        input.roleId,
        input.capabilities,
        { confirmed: input.confirmed },
      );
      return Response.json({ ok: true, ...result });
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

function employeeIdInput(body: unknown): { employeeId: string } | null {
  const { employeeId } = body as { employeeId?: unknown };
  if (typeof employeeId !== "string") return null;
  return { employeeId };
}

export async function handleDeactivateEmployeeRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => employeeIdInput(body),
    async (input) => {
      await commands.deactivateEmployee(actorId, input.employeeId);
      return Response.json({ ok: true });
    },
  );
}

export async function handleReactivateEmployeeRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => employeeIdInput(body),
    async (input) => {
      await commands.reactivateEmployee(actorId, input.employeeId);
      return Response.json({ ok: true });
    },
  );
}

export async function handleAssignManagerRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { employeeId, managerId } = body as {
        employeeId?: unknown;
        managerId?: unknown;
      };
      if (typeof employeeId !== "string") return null;
      if (managerId !== null && managerId !== undefined && typeof managerId !== "string") {
        return null;
      }
      return { employeeId, managerId: (managerId as string | null | undefined) ?? null };
    },
    async (input) => {
      await commands.assignManager(actorId, input);
      return Response.json({ ok: true });
    },
  );
}

export async function handleListAuditRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const filter: AuditFilter = {};
    const actorIdParam = params.get("actorId");
    if (actorIdParam !== null) filter.actorId = actorIdParam;
    const action = params.get("action");
    if (action !== null) filter.action = action;
    const from = params.get("from");
    if (from !== null) {
      if (!isBareDate(from)) return invalidBodyResponse();
      filter.from = from;
    }
    const to = params.get("to");
    if (to !== null) {
      if (!isBareDate(to)) return invalidBodyResponse();
      filter.to = to;
    }
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");
    if (
      (pageParam !== null && !/^\d+$/.test(pageParam)) ||
      (pageSizeParam !== null && !/^\d+$/.test(pageSizeParam))
    ) {
      return invalidBodyResponse();
    }
    const page = pageParam === null ? 1 : Number(pageParam);
    const pageSize = pageSizeParam === null ? 50 : Number(pageSizeParam);
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return invalidBodyResponse();
    }
    const result = await commands.listAuditEvents(actorId, filter, { page, pageSize });
    return Response.json({
      events: result.events,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error) {
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
}

export async function handleGetAbsenceTimeoutRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  try {
    const absenceTimeoutDays = await commands.getAbsenceTimeoutDays(actorId);
    return Response.json({ absenceTimeoutDays });
  } catch (error) {
    if (isAdminError(error)) {
      return adminErrorResponse(error);
    }
    return handleUnexpectedError(error);
  }
}

// The company-wise absence auto-skip setting (ADR-0018): a whole number of
// days; the command layer validates the bounds.
export async function handleSetAbsenceTimeoutRequest(
  request: Request,
  commands: AdminCommands,
  actorId: string,
): Promise<Response> {
  return handle(
    request,
    (body) => {
      const { absenceTimeoutDays } = body as { absenceTimeoutDays?: unknown };
      if (typeof absenceTimeoutDays !== "number" || !Number.isInteger(absenceTimeoutDays)) {
        return null;
      }
      return { absenceTimeoutDays };
    },
    async (input) => {
      await commands.setAbsenceTimeoutDays(actorId, input.absenceTimeoutDays);
      return Response.json({ ok: true, absenceTimeoutDays: input.absenceTimeoutDays });
    },
  );
}
