import {
  HR_ADMINISTRATOR_ROLE_CODE,
  SUPERADMIN_ROLE_CODE,
  type AdminDepartment,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type DepartmentInput,
  type FlowDraft,
  type FlowInput,
  type RoleInput,
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

const ADMIN_AUTHORIZED_ROLE_CODES: readonly string[] = [
  SUPERADMIN_ROLE_CODE,
  HR_ADMINISTRATOR_ROLE_CODE,
];

const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 60;
const MAX_FLOW_STEPS = 15;
const MAX_EMPLOYEE_ID_LENGTH = 100;

export type AdminCommands = {
  listEmployees(actorId: string): Promise<AdminEmployee[]>;
  listFlows(actorId: string): Promise<FlowDraft[]>;
  getAdminActor(actorId: string): Promise<AdminEmployee | null>;
  assignRole(actorId: string, input: { employeeId: string; roleId: string }): Promise<void>;
  listDepartments(actorId: string): Promise<AdminDepartment[]>;
  createDepartment(actorId: string, input: DepartmentInput): Promise<AdminDepartment>;
  deactivateDepartment(actorId: string, departmentId: string): Promise<void>;
  listRoles(actorId: string): Promise<AdminRole[]>;
  createRole(actorId: string, input: RoleInput): Promise<AdminRole>;
  deactivateRole(actorId: string, roleId: string): Promise<void>;
  createFlow(actorId: string, input: FlowInput): Promise<FlowDraft>;
  publishFlow(actorId: string, flowId: string): Promise<FlowDraft>;
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
        "Only Superadmin and HR administrators can use the admin workspace.",
      );
    }
    return actor;
  }

  function getAdminActor(actorId: string): Promise<AdminEmployee | null> {
    return store.getEmployee(actorId).then((actor) =>
      actor !== null &&
      actor.role !== null &&
      ADMIN_AUTHORIZED_ROLE_CODES.includes(actor.role.code)
        ? actor
        : null,
    );
  }

  async function requireActiveRole(organizationId: string, roleId: string): Promise<AdminRole> {
    const role = await store.getRole(roleId);
    if (!role || role.organizationId !== organizationId) {
      throw new AdminError("validation", `Unknown role "${roleId}".`);
    }
    if (!role.active) {
      throw new AdminError("validation", `Role "${role.displayName}" is not active.`);
    }
    return role;
  }

  async function audit(actor: AdminEmployee, action: string, detail: string): Promise<void> {
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

    async assignRole(actorId, { employeeId, roleId }) {
      const actor = await requireAdmin(actorId);
      if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const target = await store.getEmployee(employeeId);
      if (!target || target.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      const role = await requireActiveRole(actor.organizationId, roleId);
      if (target.role?.id === role.id) {
        return;
      }
      await store.setEmployeeRole(employeeId, role.id);
      await audit(actor, "assign-role", `${target.name} assigned to the ${role.displayName} role.`);
    },

    async listDepartments(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listDepartments(actor.organizationId);
    },

    async createDepartment(actorId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Department needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Department name is too long (max 120 characters).");
      }
      const department = await store.createDepartment(actor.organizationId, { name });
      await audit(actor, "create-department", `Created the "${name}" department.`);
      return department;
    },

    async deactivateDepartment(actorId, departmentId) {
      const actor = await requireAdmin(actorId);
      const departments = await store.listDepartments(actor.organizationId);
      const department = departments.find((candidate) => candidate.id === departmentId);
      if (!department) {
        throw new AdminError("not-found", "Department does not exist.");
      }
      await store.deactivateDepartment(departmentId);
      await audit(actor, "deactivate-department", `Deactivated the "${department.name}" department.`);
    },

    async listRoles(actorId) {
      const actor = await requireAdmin(actorId);
      return store.listRoles(actor.organizationId);
    },

    async createRole(actorId, input) {
      const actor = await requireAdmin(actorId);
      const code = input.code.trim();
      const displayName = input.displayName.trim();
      if (!code || !displayName) {
        throw new AdminError("validation", "A role needs a code and a display name.");
      }
      if (code.length > MAX_CODE_LENGTH || displayName.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Role code or display name is too long.");
      }
      if (input.departmentId) {
        const departments = await store.listDepartments(actor.organizationId);
        const department = departments.find((candidate) => candidate.id === input.departmentId);
        if (!department || !department.active) {
          throw new AdminError("validation", "Unknown or inactive department.");
        }
      }
      const role = await store.createRole(actor.organizationId, {
        code,
        displayName,
        departmentId: input.departmentId,
      });
      await audit(actor, "create-role", `Created the "${displayName}" role.`);
      return role;
    },

    async deactivateRole(actorId, roleId) {
      const actor = await requireAdmin(actorId);
      const role = await requireActiveRole(actor.organizationId, roleId);
      const [employees, flows] = await Promise.all([
        store.listEmployees(actor.organizationId),
        store.listFlows(actor.organizationId),
      ]);
      const assignedToEmployee = employees.some((employee) => employee.role?.id === role.id);
      if (assignedToEmployee) {
        throw new AdminError(
          "validation",
          `The "${role.displayName}" role is assigned to at least one employee.`,
        );
      }
      const referencedByPublishedFlow = flows.some(
        (flow) => flow.status === "published" && (flow.roleId === role.id || flow.steps.includes(role.id)),
      );
      if (referencedByPublishedFlow) {
        throw new AdminError(
          "validation",
          `The "${role.displayName}" role is referenced by a published flow.`,
        );
      }
      await store.deactivateRole(roleId);
      await audit(actor, "deactivate-role", `Deactivated the "${role.displayName}" role.`);
    },

    async createFlow(actorId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Flow needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Flow name is too long (max 120 characters).");
      }
      await requireActiveRole(actor.organizationId, input.roleId);
      if (input.steps.length === 0) {
        throw new AdminError("validation", "Flow needs at least one step.");
      }
      if (input.steps.length > MAX_FLOW_STEPS) {
        throw new AdminError("validation", "Flow cannot have more than 15 steps.");
      }
      for (const stepRoleId of input.steps) {
        await requireActiveRole(actor.organizationId, stepRoleId);
      }
      const existingFlows = await store.listFlows(actor.organizationId);
      const duplicate = existingFlows.find(
        (flow) =>
          flow.name === name && flow.roleId === input.roleId && flow.status === "draft",
      );
      if (duplicate) {
        throw new AdminError(
          "validation",
          `A draft flow named "${name}" for this role already exists.`,
        );
      }
      const flow = await store.createFlow(actor.organizationId, {
        name,
        roleId: input.roleId,
        steps: [...input.steps],
      });
      await audit(actor, "create-flow-draft", `Created the "${name}" flow draft.`);
      return flow;
    },

    // Deliberately does not require a role named "Finance Executive" as the
    // last step (issue #29): the expenses module treats whichever role is
    // last in a Flow's steps as its terminal, non-skippable stage, so any
    // Flow already gets a real payment-completion stage without Superadmin
    // needing to name it "Finance Executive". Reserved, non-deletable named
    // roles remain unimplemented; still tracked as follow-up.
    async publishFlow(actorId, flowId) {
      const actor = await requireAdmin(actorId);
      const flows = await store.listFlows(actor.organizationId);
      const flow = flows.find((candidate) => candidate.id === flowId);
      if (!flow) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      if (flow.status !== "draft") {
        throw new AdminError("validation", "Only a draft flow can be published.");
      }
      const published = await store.publishFlow(flowId);
      await audit(actor, "publish-flow", `Published the "${flow.name}" flow.`);
      return published;
    },
  };
}
