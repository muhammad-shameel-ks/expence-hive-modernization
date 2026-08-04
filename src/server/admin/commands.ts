import {
  isAdminRole,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type FlowDraft,
  type FlowInput,
} from "./ports";

export type AdminErrorCode = "unauthorized" | "validation" | "not-found";

export class AdminError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const ADMIN_AUTHORIZED_ROLES: readonly AdminRole[] = [
  "HR administrator",
  "System administrator",
];

export type AdminCommands = {
  listEmployees(actorId: string): Promise<AdminEmployee[]>;
  listFlows(actorId: string): Promise<FlowDraft[]>;
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
    const actor = await store.getEmployee(actorId);
    if (!actor || !ADMIN_AUTHORIZED_ROLES.includes(actor.role ?? "Employee")) {
      throw new AdminError(
        "unauthorized",
        "Only HR and system administrators can use the admin workspace.",
      );
    }
    return actor;
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
      const target = await store.getEmployee(employeeId);
      if (!target) {
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
      const scope = input.scope.trim();
      if (!scope) {
        throw new AdminError("validation", "Flow needs a scope.");
      }
      if (input.steps.length === 0) {
        throw new AdminError("validation", "Flow needs at least one step.");
      }
      for (const step of input.steps) {
        if (!isAdminRole(step)) {
          throw new AdminError("validation", `Unknown role "${step}" in flow steps.`);
        }
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
