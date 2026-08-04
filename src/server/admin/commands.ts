import {
  isAdminRole,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type FlowDraft,
  type FlowInput,
} from "./ports";

export type AdminErrorCode = "unauthorized" | "validation" | "not-found";

const ADMIN_ERROR_CODES = ["unauthorized", "validation", "not-found"] as const;

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export function isAdminError(error: unknown): error is AdminError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    (ADMIN_ERROR_CODES as readonly string[]).includes((error as { code: string }).code)
  );
}

const ADMIN_AUTHORIZED_ROLES: readonly AdminRole[] = [
  "HR administrator",
  "System administrator",
];

export type AdminCommands = {
  listEmployees(actorId: string): Promise<AdminEmployee[]>;
  listFlows(actorId: string): Promise<FlowDraft[]>;
  getAdminActor(actorId: string): Promise<AdminEmployee | null>;
  assignRole(
    actorId: string,
    input: { employeeId: string; role: AdminRole },
  ): Promise<void>;
  createFlowDraft(actorId: string, input: FlowInput): Promise<FlowDraft>;
};

export function createAdminCommands({
  store,
  now = () => new Date(),
}: {
  store: AdminStore;
  now?: () => Date;
}): AdminCommands {
  async function requireAdmin(actorId: string): Promise<AdminEmployee> {
    const actor = await getAdminActor(actorId);
    if (!actor) {
      throw new AdminError(
        "unauthorized",
        "Only HR and system administrators can use the admin workspace.",
      );
    }
    return actor;
  }

  function getAdminActor(actorId: string): Promise<AdminEmployee | null> {
    return store.getEmployee(actorId).then((actor) =>
      actor && ADMIN_AUTHORIZED_ROLES.includes(actor.role ?? "Employee") ? actor : null,
    );
  }

  async function audit(
    actor: AdminEmployee,
    action: string,
    detail: string,
  ): Promise<void> {
    await store.appendAudit(actor.organizationId, {
      id: `audit-${crypto.randomUUID()}`,
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      detail,
      createdAt: now(),
    });
  }

  return {
    getAdminActor,

    async listEmployees(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listEmployees(actor.organizationId);
    },

    async listFlows(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listFlows(actor.organizationId);
    },

    async assignRole(actorId, { employeeId, role }) {
      const actor = await requireAdmin(actorId);
      if (!isAdminRole(role)) {
        throw new AdminError("validation", `Unknown role "${role}".`);
      }
      if (employeeId.length > 100) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const target = await store.getEmployee(employeeId);
      if (!target || target.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      if (target.role === role) {
        return;
      }
      await store.setEmployeeRole(employeeId, role);
      await audit(
        actor,
        "assign-role",
        `${target.name} assigned to the ${role} role.`,
      );
    },

    async createFlowDraft(actorId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Flow needs a name.");
      }
      if (name.length > 120) {
        throw new AdminError("validation", "Flow name is too long (max 120 characters).");
      }
      const scope = input.scope.trim();
      if (!scope) {
        throw new AdminError("validation", "Flow needs a scope.");
      }
      if (scope.length > 60) {
        throw new AdminError("validation", "Flow scope is too long (max 60 characters).");
      }
      if (input.steps.length === 0) {
        throw new AdminError("validation", "Flow needs at least one step.");
      }
      if (input.steps.length > 15) {
        throw new AdminError("validation", "Flow cannot have more than 15 steps.");
      }
      for (const step of input.steps) {
        if (!isAdminRole(step)) {
          throw new AdminError("validation", `Unknown role "${step}" in flow steps.`);
        }
      }
      const existingFlows = await store.listFlows(actor.organizationId);
      const duplicate = existingFlows.find(
        (flow) => flow.name === name && flow.scope === scope && flow.status === "draft",
      );
      if (duplicate) {
        throw new AdminError(
          "validation",
          `A draft flow named "${name}" for ${scope} already exists.`,
        );
      }
      const flow = await store.createFlow(actor.organizationId, {
        name,
        scope,
        steps: [...input.steps],
      });
      await audit(
        actor,
        "create-flow-draft",
        `Created the "${name}" flow for ${scope}.`,
      );
      return flow;
    },
  };
}
