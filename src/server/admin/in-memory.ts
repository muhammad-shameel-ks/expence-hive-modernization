import { AdminError } from "./commands";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AdminStore,
  AuditEvent,
  DepartmentInput,
  FlowDraft,
  FlowInput,
  RoleInput,
} from "./ports";

type StoredFlow = FlowDraft & { organizationId: string };
type StoredRole = AdminRole;

export class InMemoryAdminStore implements AdminStore {
  private readonly employeesById: Map<string, AdminEmployee>;
  private readonly departments: AdminDepartment[] = [];
  private readonly roles: StoredRole[] = [];
  private readonly flows: StoredFlow[] = [];
  readonly audit: AuditEvent[] = [];

  constructor(employees: readonly AdminEmployee[]) {
    this.employeesById = new Map(
      employees.map((employee) => [employee.id, { ...employee }]),
    );
  }

  async listEmployees(organizationId: string): Promise<AdminEmployee[]> {
    return [...this.employeesById.values()]
      .filter((employee) => employee.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getEmployee(id: string): Promise<AdminEmployee | null> {
    return this.employeesById.get(id) ?? null;
  }

  // Organization scoping is the caller's contract: the command layer resolves
  // the actor's organization and checks the target belongs to it before
  // calling this store, matching the pg store which is also called only from
  // within an org-scoped command.
  async setEmployeeRole(employeeId: string, roleId: string): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    const role = this.roles.find((candidate) => candidate.id === roleId);
    if (employee && role) {
      employee.role = { id: role.id, code: role.code, displayName: role.displayName };
    }
  }

  async setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    const department = this.departments.find((candidate) => candidate.id === departmentId);
    if (employee && department) {
      employee.department = department.name;
      employee.departmentId = department.id;
    }
  }

  async listDepartments(organizationId: string): Promise<AdminDepartment[]> {
    return this.departments
      .filter((department) => department.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createDepartment(
    organizationId: string,
    input: DepartmentInput,
  ): Promise<AdminDepartment> {
    const duplicate = this.departments.find(
      (department) =>
        department.organizationId === organizationId && department.name === input.name,
    );
    if (duplicate) {
      throw new AdminError("validation", `A department named "${input.name}" already exists.`);
    }
    const department: AdminDepartment = {
      id: `dept-${crypto.randomUUID()}`,
      organizationId,
      name: input.name,
      active: true,
    };
    this.departments.push(department);
    return department;
  }

  async deactivateDepartment(departmentId: string): Promise<void> {
    const department = this.departments.find((candidate) => candidate.id === departmentId);
    if (department) {
      department.active = false;
    }
  }

  async listRoles(organizationId: string): Promise<AdminRole[]> {
    return this.roles
      .filter((role) => role.organizationId === organizationId)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async getRole(roleId: string): Promise<AdminRole | null> {
    return this.roles.find((role) => role.id === roleId) ?? null;
  }

  async createRole(organizationId: string, input: RoleInput): Promise<AdminRole> {
    const duplicate = this.roles.find(
      (role) => role.organizationId === organizationId && role.code === input.code,
    );
    if (duplicate) {
      throw new AdminError("validation", `A role with code "${input.code}" already exists.`);
    }
    const role: AdminRole = {
      id: `role-${crypto.randomUUID()}`,
      organizationId,
      code: input.code,
      displayName: input.displayName,
      departmentId: input.departmentId,
      active: true,
    };
    this.roles.push(role);
    return role;
  }

  async deactivateRole(roleId: string): Promise<void> {
    const role = this.roles.find((candidate) => candidate.id === roleId);
    if (role) {
      role.active = false;
    }
  }

  async createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft> {
    // Mirrors the pg store's invariant (migration 0010): at most one draft
    // per (organization, name, role). The command layer checks first; this
    // keeps both stores consistent when the check is bypassed.
    const duplicate = this.flows.find(
      (flow) =>
        flow.organizationId === organizationId &&
        flow.name === input.name &&
        flow.roleId === input.roleId &&
        flow.status === "draft",
    );
    if (duplicate) {
      throw new AdminError(
        "validation",
        `A draft flow named "${input.name}" for this role already exists.`,
      );
    }
    const flow: StoredFlow = {
      id: `flow-${crypto.randomUUID()}`,
      organizationId,
      ...input,
      steps: [...input.steps],
      status: "draft",
    };
    this.flows.unshift(flow);
    return flow;
  }

  async updateFlow(flowId: string, input: FlowInput): Promise<FlowDraft> {
    const flow = this.flows.find((candidate) => candidate.id === flowId);
    if (!flow) {
      throw new AdminError("not-found", "Flow does not exist.");
    }
    flow.name = input.name;
    flow.roleId = input.roleId;
    flow.steps = [...input.steps];
    return flow;
  }

  async publishFlow(flowId: string): Promise<FlowDraft> {
    const flow = this.flows.find((candidate) => candidate.id === flowId);
    if (!flow) {
      throw new AdminError("not-found", "Flow does not exist.");
    }
    flow.status = "published";
    return flow;
  }

  async deleteFlow(flowId: string): Promise<void> {
    const index = this.flows.findIndex((candidate) => candidate.id === flowId);
    if (index !== -1) {
      this.flows.splice(index, 1);
    }
  }

  async listFlows(organizationId: string): Promise<FlowDraft[]> {
    return this.flows.filter((flow) => flow.organizationId === organizationId);
  }

  async appendAudit(organizationId: string, event: AuditEvent): Promise<void> {
    this.audit.push({ ...event, organizationId });
  }
}
