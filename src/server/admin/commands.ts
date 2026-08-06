import { resolveRoleCapabilities, SUPERADMIN_ROLE_CODE } from "../shared/authorization";
import {
  type AdminDepartment,
  type AdminEmployee,
  type AdminRole,
  type AdminStore,
  type AuditEvent,
  type AuditFilter,
  type DepartmentInput,
  type FlowDraft,
  type FlowInput,
  type FlowStepInput,
  type RoleInput,
} from "./ports";

export type AdminErrorCode =
  | "unauthorized"
  | "validation"
  | "not-found"
  | "locked"
  | "conflict";

const ADMIN_ERROR_CODES = [
  "unauthorized",
  "validation",
  "not-found",
  "locked",
  "conflict",
] as const;

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

const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 60;
const MAX_FLOW_STEPS = 15;
const MAX_EMPLOYEE_ID_LENGTH = 100;

export type AdminCommands = {
  listEmployees(actorId: string): Promise<AdminEmployee[]>;
  listFlows(actorId: string): Promise<FlowDraft[]>;
  getAdminActor(actorId: string): Promise<AdminEmployee | null>;
  listAuditEvents(
    actorId: string,
    filter: AuditFilter,
    pagination?: { page?: number; pageSize?: number },
  ): Promise<{ events: AuditEvent[]; total: number }>;
  assignRole(actorId: string, input: { employeeId: string; roleId: string }): Promise<void>;
  assignDepartment(actorId: string, input: { employeeId: string; departmentId: string }): Promise<void>;
  deactivateEmployee(actorId: string, employeeId: string): Promise<void>;
  reactivateEmployee(actorId: string, employeeId: string): Promise<void>;
  assignManager(actorId: string, input: { employeeId: string; managerId: string | null }): Promise<void>;
  listDepartments(actorId: string): Promise<AdminDepartment[]>;
  createDepartment(actorId: string, input: DepartmentInput): Promise<AdminDepartment>;
  deactivateDepartment(actorId: string, departmentId: string): Promise<void>;
  listRoles(actorId: string): Promise<AdminRole[]>;
  createRole(actorId: string, input: RoleInput): Promise<AdminRole>;
  deactivateRole(actorId: string, roleId: string): Promise<void>;
  createFlow(actorId: string, input: FlowInput): Promise<FlowDraft>;
  updateFlow(actorId: string, flowId: string, input: FlowInput): Promise<FlowDraft>;
  publishFlow(actorId: string, flowId: string): Promise<FlowDraft>;
  deleteFlow(actorId: string, flowId: string): Promise<void>;
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
      throw new AdminError("unauthorized", "Only Superadmin can use the admin workspace.");
    }
    return actor;
  }

  function getAdminActor(actorId: string): Promise<AdminEmployee | null> {
    return store.getEmployee(actorId).then((actor) =>
      actor !== null &&
      actor.role !== null &&
      resolveRoleCapabilities(actor.role.code).canAccessAdminConsole
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

  async function resolveEmployeeInOrg(
    organizationId: string,
    employeeId: string,
  ): Promise<AdminEmployee> {
    if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
      throw new AdminError("validation", "Employee id is too long.");
    }
    const target = await store.getEmployee(employeeId);
    if (!target || target.organizationId !== organizationId) {
      throw new AdminError("not-found", "Employee does not exist.");
    }
    return target;
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

  // Flow steps target either a role (existing, active, org-wide) or the
  // requester's assigned team lead. A team-lead step must not carry a role
  // id and a role step must carry one; anything else is malformed input.
  async function validateFlowSteps(organizationId: string, steps: FlowStepInput[]): Promise<void> {
    if (steps.length === 0) {
      throw new AdminError("validation", "Flow needs at least one step.");
    }
    if (steps.length > MAX_FLOW_STEPS) {
      throw new AdminError("validation", "Flow cannot have more than 15 steps.");
    }
    for (const step of steps) {
      if (step.kind === "team-lead") {
        if ("roleId" in step) {
          throw new AdminError("validation", "A team lead step cannot carry a role id.");
        }
        continue;
      }
      if (step.kind !== "role") {
        throw new AdminError("validation", "A flow step must target a role or a team lead.");
      }
      await requireActiveRole(organizationId, step.roleId);
    }
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

    async listAuditEvents(actorId, filter, pagination) {
      const actor = await requireAdmin(actorId);
      const page = Math.max(1, Math.floor(pagination?.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Math.floor(pagination?.pageSize ?? 50)));
      return store.listAuditEvents(actor.organizationId, filter, { page, pageSize });
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

    async assignDepartment(actorId, { employeeId, departmentId }) {
      const actor = await requireAdmin(actorId);
      if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const target = await store.getEmployee(employeeId);
      if (!target || target.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Employee does not exist.");
      }
      const department = (await store.listDepartments(actor.organizationId)).find(
        (dept) => dept.id === departmentId && dept.active,
      );
      if (!department) {
        throw new AdminError("not-found", "Department does not exist or is inactive.");
      }
      if (target.departmentId === department.id || target.department === department.name) {
        return;
      }
      await store.setEmployeeDepartment(employeeId, department.id);
      await audit(actor, "assign-department", `${target.name} moved to the ${department.name} department.`);
    },

    async deactivateEmployee(actorId, employeeId) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      if (actor.id === employeeId) {
        throw new AdminError("conflict", "You cannot deactivate your own account.");
      }
      if (target.role?.code === SUPERADMIN_ROLE_CODE) {
        const employees = await store.listEmployees(actor.organizationId);
        const otherActiveSuperadmins = employees.filter(
          (employee) =>
            employee.id !== employeeId &&
            employee.active &&
            employee.role?.code === SUPERADMIN_ROLE_CODE,
        );
        if (otherActiveSuperadmins.length === 0) {
          throw new AdminError("conflict", "The last active Superadmin cannot be deactivated.");
        }
      }
      await store.setEmployeeActive(employeeId, false);
      await audit(actor, "deactivate-employee", `${target.name} deactivated.`);
    },

    async reactivateEmployee(actorId, employeeId) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      await store.setEmployeeActive(employeeId, true);
      await audit(actor, "reactivate-employee", `${target.name} reactivated.`);
    },

    async assignManager(actorId, { employeeId, managerId }) {
      const actor = await requireAdmin(actorId);
      const target = await resolveEmployeeInOrg(actor.organizationId, employeeId);
      if (managerId === null) {
        if (target.managerId === null) {
          return;
        }
        await store.setEmployeeManager(employeeId, null);
        await audit(actor, "assign-manager", `Cleared ${target.name}'s manager assignment.`);
        return;
      }
      if (managerId === employeeId) {
        throw new AdminError("validation", "An employee cannot be their own manager.");
      }
      if (managerId.length > MAX_EMPLOYEE_ID_LENGTH) {
        throw new AdminError("validation", "Employee id is too long.");
      }
      const manager = await store.getEmployee(managerId);
      if (!manager || manager.organizationId !== actor.organizationId) {
        throw new AdminError("not-found", "Manager does not exist.");
      }
      if (!manager.active) {
        throw new AdminError("validation", "A deactivated employee cannot be a manager.");
      }
      if (target.managerId === manager.id) {
        return;
      }
      await store.setEmployeeManager(employeeId, manager.id);
      await audit(actor, "assign-manager", `${target.name} now reports to ${manager.name}.`);
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
      // Roles are org-wide definitions: no department scoping on creation.
      const role = await store.createRole(actor.organizationId, { code, displayName });
      await audit(actor, "create-role", `Created the "${displayName}" role.`);
      return role;
    },

    async deactivateRole(actorId, roleId) {
      const actor = await requireAdmin(actorId);
      const role = await requireActiveRole(actor.organizationId, roleId);
      if (role.locked) {
        throw new AdminError("locked", "Locked predefined roles cannot be deactivated.");
      }
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
        (flow) =>
          flow.status === "published" &&
          (flow.roleId === role.id ||
            flow.steps.some((step) => step.kind === "role" && step.roleId === role.id)),
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
      await validateFlowSteps(actor.organizationId, input.steps);
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

    async updateFlow(actorId, flowId, input) {
      const actor = await requireAdmin(actorId);
      const name = input.name.trim();
      if (!name) {
        throw new AdminError("validation", "Flow needs a name.");
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new AdminError("validation", "Flow name is too long (max 120 characters).");
      }
      if (!input.roleId) {
        throw new AdminError("validation", "Flow needs an assigned role.");
      }
      await validateFlowSteps(actor.organizationId, input.steps);
      const updated = await store.updateFlow(flowId, {
        name,
        roleId: input.roleId,
        steps: [...input.steps],
      });
      await audit(actor, "update-flow", `Updated the "${name}" flow.`);
      return updated;
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

    async deleteFlow(actorId, flowId) {
      const actor = await requireAdmin(actorId);
      const flows = await store.listFlows(actor.organizationId);
      const flow = flows.find((candidate) => candidate.id === flowId);
      if (!flow) {
        throw new AdminError("not-found", "Flow does not exist.");
      }
      await store.deleteFlow(flowId);
      await audit(actor, "delete-flow", `Deleted the "${flow.name}" flow.`);
    },
  };
}
