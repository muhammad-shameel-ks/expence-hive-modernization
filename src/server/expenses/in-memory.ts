import { ExpenseError } from "./commands";
import type {
  ActivityEntry,
  BankDetailChangeRequest,
  BankDetails,
  ExpenseClaim,
  ExpenseEmployee,
  ExpenseFlow,
  ExpenseHistoryEvent,
  ExpenseStore,
} from "./ports";

export class InMemoryExpenseStore implements ExpenseStore {
  private readonly employees: ExpenseEmployee[];
  private readonly flows: ExpenseFlow[];
  private readonly claims = new Map<string, ExpenseClaim>();
  private readonly bankRequests = new Map<string, BankDetailChangeRequest>();
  // The approved account per employee, kept in sync with approvals: the
  // active bank details are the last approved request's details.
  private readonly approvedBankDetails = new Map<string, BankDetails>();

  constructor(input: {
    employees: ExpenseEmployee[];
    flows?: ExpenseFlow[];
    approvedBankDetails?: Record<string, BankDetails>;
  }) {
    this.employees = input.employees.map((employee) => ({
      ...employee,
      role: employee.role ? { ...employee.role } : null,
    }));
    this.flows = (input.flows ?? []).map((flow) => ({ ...flow, steps: [...flow.steps] }));
    for (const [employeeId, details] of Object.entries(input.approvedBankDetails ?? {})) {
      this.approvedBankDetails.set(employeeId, { ...details });
    }
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

  // Mirrors what the admin console's role-privilege editing does against
  // the pg store (ADR-0015): lets tests verify that a role losing its
  // action privileges mid-flow is swept forward like a vacant stage. Not
  // part of the ExpenseStore contract; the real store is mutated through
  // the admin commands.
  setEmployeeRole(employeeId: string, role: ExpenseEmployee["role"]): void {
    const employee = this.employees.find((candidate) => candidate.id === employeeId);
    if (employee) {
      employee.role = role;
    }
  }

  async listEmployees(organizationId: string): Promise<ExpenseEmployee[]> {
    return this.employees.filter((employee) => employee.organizationId === organizationId);
  }

  async listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]> {
    // Mirrors the pg store: besides claims the employee raised or is
    // currently assigned to, an active holder of the terminal stage's role
    // also sees every in-finance claim of that stage (pool semantics,
    // stories 13/14), so claims assigned to another pool member surface for
    // the holder to verify or mark paid. The claim's current stage is the
    // terminal one whenever status is in-finance, so any pending/verified
    // step with the holder's role is that stage.
    const claims = [...this.claims.values()].filter((claim) => {
      if (claim.organizationId !== employee.organizationId) return false;
      if (claim.requesterId === employee.id) return true;
      if (claim.currentActorId === employee.id) return true;
      if (claim.status === "in-finance" && employee.role) {
        const roleId = employee.role.id;
        return claim.steps.some(
          (step) =>
            (step.status === "pending" || step.status === "verified") &&
            step.roleId !== null &&
            step.roleId === roleId,
        );
      }
      return false;
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

  async deleteClaim(id: string, version: number): Promise<void> {
    // Mirrors the pg store's optimistic guard (updateClaim's version check):
    // a claim submitted between the deleteDraft read and this call must not
    // be destroyed, and its stored receipt bytes must stay reachable.
    const claim = this.claims.get(id);
    if (!claim || claim.status !== "draft" || claim.version !== version) {
      throw new ExpenseError("conflict", "Claim was changed by another request.");
    }
    this.claims.delete(id);
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

  async getApprovedBankDetails(employeeId: string): Promise<BankDetails | null> {
    const details = this.approvedBankDetails.get(employeeId);
    return details ? { ...details } : null;
  }

  async listApprovedBankDetails(organizationId: string): Promise<
    Array<{ employeeId: string; details: BankDetails }>
  > {
    const employees = this.employees.filter(
      (employee) => employee.organizationId === organizationId,
    );
    return employees.flatMap((employee) => {
      const details = this.approvedBankDetails.get(employee.id);
      return details ? [{ employeeId: employee.id, details: { ...details } }] : [];
    });
  }

  async listBankDetailChangeRequests(employeeId: string): Promise<BankDetailChangeRequest[]> {
    return [...this.bankRequests.values()]
      .filter((request) => request.employeeId === employeeId)
      .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0))
      .map((request) => structuredClone(request));
  }

  async listPendingBankDetailChangeRequests(
    organizationId: string,
  ): Promise<BankDetailChangeRequest[]> {
    return [...this.bankRequests.values()]
      .filter(
        (request) => request.organizationId === organizationId && request.status === "pending",
      )
      .sort((a, b) => (a.requestedAt > b.requestedAt ? 1 : a.requestedAt < b.requestedAt ? -1 : 0))
      .map((request) => structuredClone(request));
  }

  async getBankDetailChangeRequest(id: string): Promise<BankDetailChangeRequest | null> {
    const request = this.bankRequests.get(id);
    return request ? structuredClone(request) : null;
  }

  async createBankDetailChangeRequest(request: BankDetailChangeRequest): Promise<void> {
    this.bankRequests.set(request.id, structuredClone(request));
  }

  async updateBankDetailChangeRequest(request: BankDetailChangeRequest): Promise<void> {
    this.bankRequests.set(request.id, structuredClone(request));
    // The active account follows the request lifecycle: an approval
    // activates the requested details, a rejection leaves the previous
    // approved account untouched (or none when this was the first request).
    if (request.status === "approved") {
      this.approvedBankDetails.set(request.employeeId, { ...request.requested });
    }
  }

  async updatePersonalDetails(employeeId: string, input: { phone?: string }): Promise<void> {
    const employee = this.employees.find((candidate) => candidate.id === employeeId);
    if (employee) {
      employee.phone = input.phone?.trim() ? input.phone.trim() : undefined;
    }
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
