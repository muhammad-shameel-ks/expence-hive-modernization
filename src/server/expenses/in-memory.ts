import type { ActivityEntry, ExpenseClaim, ExpenseEmployee, ExpenseFlow, ExpenseHistoryEvent, ExpenseStore } from "./ports";

export class InMemoryExpenseStore implements ExpenseStore {
  private readonly employees: ExpenseEmployee[];
  private readonly flows: ExpenseFlow[];
  private readonly claims = new Map<string, ExpenseClaim>();

  constructor(input: { employees: ExpenseEmployee[]; flows?: ExpenseFlow[] }) {
    this.employees = input.employees.map((employee) => ({
      ...employee,
      role: employee.role ? { ...employee.role } : null,
    }));
    this.flows = (input.flows ?? []).map((flow) => ({ ...flow, steps: [...flow.steps] }));
  }

  async getEmployee(id: string): Promise<ExpenseEmployee | null> {
    return this.employees.find((employee) => employee.id === id) ?? null;
  }

  // Mirrors what the admin console's deactivation path does against the
  // pg store: lets tests verify that an assigned actor deactivated mid-flow
  // is treated as vacant by catch-up. Not part of the ExpenseStore
  // contract; the real store is mutated through the admin commands.
  setEmployeeActive(employeeId: string, active: boolean): void {
    const employee = this.employees.find((candidate) => candidate.id === employeeId);
    if (employee) {
      employee.active = active;
    }
  }

  async listEmployees(organizationId: string): Promise<ExpenseEmployee[]> {
    return this.employees.filter((employee) => employee.organizationId === organizationId);
  }

  async listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]> {
    const claims = [...this.claims.values()].filter((claim) => {
      if (claim.organizationId !== employee.organizationId) return false;
      if (claim.requesterId === employee.id) return true;
      return claim.currentActorId === employee.id;
    });
    return claims.map((claim) => structuredClone(claim));
  }

  async listClaimsForOrganization(organizationId: string): Promise<ExpenseClaim[]> {
    const claims = [...this.claims.values()].filter((claim) => claim.organizationId === organizationId);
    return claims.map((claim) => structuredClone(claim));
  }

  async createClaim(claim: ExpenseClaim): Promise<void> {
    this.claims.set(claim.id, structuredClone(claim));
  }

  async getClaim(id: string): Promise<ExpenseClaim | null> {
    const claim = this.claims.get(id);
    return claim ? structuredClone(claim) : null;
  }

  async updateClaim(claim: ExpenseClaim): Promise<void> {
    this.claims.set(claim.id, structuredClone(claim));
  }

  async getPublishedFlowForRole(organizationId: string, roleId: string): Promise<ExpenseFlow | null> {
    // Deterministic routing: only the flow published for the role matches.
    // A role without its own published flow gets no flow at all - the
    // "most recently created published flow" fallback was removed (story 40).
    return this.flows.find((flow) => flow.roleId === roleId) ?? null;
  }

  async listActivityForActor(
    organizationId: string,
    actorId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]> {
    return this.collectActivity(organizationId, kinds, (event) => event.actorId === actorId);
  }

  async listActivityForOrganization(
    organizationId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]> {
    return this.collectActivity(organizationId, kinds, () => true);
  }

  private async collectActivity(
    organizationId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
    matches: (event: ExpenseClaim["history"][number]) => boolean,
  ): Promise<ActivityEntry[]> {
    const entries: ActivityEntry[] = [];
    for (const claim of this.claims.values()) {
      if (claim.organizationId !== organizationId) continue;
      const requester = this.employees.find((employee) => employee.id === claim.requesterId);
      for (const event of claim.history) {
        if (!event.actorId || !kinds.includes(event.kind) || !matches(event)) continue;
        const actor = this.employees.find((employee) => employee.id === event.actorId);
        entries.push({
          id: event.id,
          claimId: claim.id,
          claimRef: claim.ref,
          claimTitle: claim.title,
          claimCategory: claim.category,
          claimAmountMinor: claim.amountMinor,
          claimCurrency: claim.currency,
          requesterId: claim.requesterId,
          requesterName: requester?.name ?? "Unknown",
          actorId: event.actorId,
          actorName: actor?.name ?? "Unknown",
          kind: event.kind,
          detail: event.detail,
          createdAt: event.createdAt,
        });
      }
    }
    return entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }
}
