import type {
  AdminEmployee,
  AdminRole,
  AdminStore,
  AuditEvent,
  FlowDraft,
  FlowInput,
} from "./ports";

type StoredFlow = FlowDraft & { organizationId: string };

export class InMemoryAdminStore implements AdminStore {
  private readonly employeesById: Map<string, AdminEmployee>;
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
  async setEmployeeRole(employeeId: string, role: AdminRole): Promise<void> {
    const employee = this.employeesById.get(employeeId);
    if (employee) {
      employee.role = role;
    }
  }

  async createFlow(organizationId: string, input: FlowInput): Promise<FlowDraft> {
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

  async listFlows(organizationId: string): Promise<FlowDraft[]> {
    return this.flows.filter((flow) => flow.organizationId === organizationId);
  }

  async appendAudit(organizationId: string, event: AuditEvent): Promise<void> {
    this.audit.push({ ...event, organizationId });
  }
}
