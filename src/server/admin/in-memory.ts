import { AdminError } from "./commands";
import { auditRangeBounds } from "./audit-filter";
import { DEFAULT_ABSENCE_TIMEOUT_DAYS } from "../shared/absence-timeout";
import { SUBMIT_ONLY_CAPABILITIES, type RoleCapabilities } from "../shared/authorization";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AdminStore,
  AuditEvent,
  AuditFilter,
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
  private readonly roles: StoredRole[];
  private readonly flows: StoredFlow[] = [];
  private readonly absenceTimeoutDaysByOrg = new Map<string, number>();
  readonly audit: AuditEvent[] = [];

  constructor(employees: readonly AdminEmployee[], roles: readonly AdminRole[] = []) {
    this.employeesById = new Map(
      employees.map((employee) => [employee.id, { ...employee }]),
    );
    this.roles = roles.map((role) => ({ ...role }));
  }

  async listEmployees(organizationId: string): Promise<AdminEmployee[]> {
    return [...this.employeesById.values()]
      .filter((employee) => employee.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getEmployee(id: string): Promise<AdminEmployee | null> {
    return this.employeesById.get(id) ?? null;
  }

  async createEmployee(
    organizationId: string,
    input: { id: string; name: string; email: string },
  ): Promise<AdminEmployee> {
    const employee: AdminEmployee = {
      id: input.id,
      organizationId,
      name: input.name,
      email: input.email,
      department: "",
      departmentId: null,
      role: null,
      active: true,
      managerId: null,
    };
    this.employeesById.set(employee.id, employee);
    return employee;
  }

  // All-or-nothing bulk creation mirrors the pg store's transaction: every
  // row is written through the same path as createEmployee, and a failing
  // row aborts the whole batch without partial writes.
  async createEmployees(
    organizationId: string,
    inputs: Array<{
      id: string;
      name: string;
      email: string;
      roleId: string | null;
      departmentId: string | null;
      managerId: string | null;
    }>,
  ): Promise<AdminEmployee[]> {
    const created: AdminEmployee[] = [];
    for (const input of inputs) {
      const employee = await this.createEmployee(organizationId, {
        id: input.id,
        name: input.name,
        email: input.email,
      });
      if (input.departmentId !== null) {
        await this.setEmployeeDepartment(employee.id, input.departmentId);
      }
      if (input.roleId !== null) {
        await this.setEmployeeRole(employee.id, input.roleId);
      }
      if (input.managerId !== null) {
        await this.setEmployeeManager(employee.id, input.managerId);
      }
      created.push(employee);
    }
    return created;
  }

  async findEmployeeByEmail(
    organizationId: string,
    email: string,
  ): Promise<AdminEmployee | null> {
    return (
      [...this.employeesById.values()].find(
        (employee) =>
          employee.organizationId === organizationId && employee.email === email,
      ) ?? null
    );
  }

  // Organization scoping is the caller's contract: the command layer resolves
  // the actor's organization and checks the target belongs to it before
  // calling this store, matching the pg store which is also called only from
  // within an org-scoped command.
  async setEmployeeRole(employeeId: string, roleId: string): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    const role = this.roles.find((candidate) => candidate.id === roleId);
    if (employee && role) {
      employee.role = {
        id: role.id,
        code: role.code,
        displayName: role.displayName,
        capabilities: role.capabilities,
      };
    }
  }

  async setEmployeeDepartment(employeeId: string, departmentId: string): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    const department = this.departments.find((candidate) => candidate.id === departmentId);
    if (employee && department) {
      employee.department = department.name;
      employee.departmentId = department.id;
    }
    for (const dept of this.departments) {
      if (dept.headId === employeeId && dept.id !== departmentId) {
        dept.headId = null;
        dept.head = null;
      }
    }
  }

  async setEmployeeActive(employeeId: string, active: boolean): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    if (employee) {
      employee.active = active;
    }
  }

  async setEmployeeManager(employeeId: string, managerId: string | null): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    if (employee) {
      employee.managerId = managerId;
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
    const head = this.employeesById.get(input.headId) ?? null;
    const department: AdminDepartment = {
      id: `dept-${crypto.randomUUID()}`,
      organizationId,
      name: input.name,
      active: true,
      headId: input.headId,
      head: head ? { id: head.id, name: head.name } : null,
    };
    this.departments.push(department);
    return department;
  }

  async setDepartmentHead(departmentId: string, headId: string): Promise<void> {
    const department = this.departments.find((candidate) => candidate.id === departmentId);
    const head = this.employeesById.get(headId) ?? null;
    if (department) {
      department.headId = headId;
      department.head = head ? { id: head.id, name: head.name } : null;
    }
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
      departmentId: null,
      active: true,
      locked: false,
      capabilities: input.capabilities ?? SUBMIT_ONLY_CAPABILITIES,
    };
    this.roles.push(role);
    return role;
  }

  async setRoleCapabilities(roleId: string, capabilities: RoleCapabilities): Promise<void> {
    const role = this.roles.find((candidate) => candidate.id === roleId);
    if (role) {
      role.capabilities = { ...capabilities };
    }
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

  async listAuditEvents(
    organizationId: string,
    filter: AuditFilter,
    pagination: { page: number; pageSize: number },
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const { from, to } = auditRangeBounds(filter);
    const matching = this.audit.filter((event) => {
      if (event.organizationId !== organizationId) return false;
      if (filter.actorId && event.actorId !== filter.actorId) return false;
      if (filter.action && event.action !== filter.action) return false;
      if (from && event.createdAt < from) return false;
      if (to && event.createdAt >= to) return false;
      return true;
    });
    const sorted = [...matching].sort((a, b) => {
      const byTime = b.createdAt.getTime() - a.createdAt.getTime();
      return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
    });
    const offset = (pagination.page - 1) * pagination.pageSize;
    return {
      events: sorted.slice(offset, offset + pagination.pageSize),
      total: sorted.length,
    };
  }

  async getAbsenceTimeoutDays(organizationId: string): Promise<number> {
    return this.absenceTimeoutDaysByOrg.get(organizationId) ?? DEFAULT_ABSENCE_TIMEOUT_DAYS;
  }

  async setAbsenceTimeoutDays(organizationId: string, days: number): Promise<void> {
    this.absenceTimeoutDaysByOrg.set(organizationId, days);
  }

  async listOrganizations(): Promise<string[]> {
    // Organizations are not first-class entities in this store (the pg
    // store queries the organizations table); derive the set from every
    // entity that references one.
    const ids = new Set<string>();
    for (const employee of this.employeesById.values()) ids.add(employee.organizationId);
    for (const department of this.departments) ids.add(department.organizationId);
    for (const role of this.roles) ids.add(role.organizationId);
    for (const flow of this.flows) ids.add(flow.organizationId);
    for (const organizationId of this.absenceTimeoutDaysByOrg.keys()) ids.add(organizationId);
    return [...ids].sort();
  }
}
