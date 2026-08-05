import type { ExpenseClaim, ExpenseEmployee, ExpenseStore } from "./ports";

export class InMemoryExpenseStore implements ExpenseStore {
  private readonly employees: ExpenseEmployee[];
  private readonly claims = new Map<string, ExpenseClaim>();

  constructor(input: { employees: ExpenseEmployee[] }) {
    this.employees = input.employees.map((employee) => ({
      ...employee,
      roleCodes: [...employee.roleCodes],
    }));
  }

  async getEmployee(id: string): Promise<ExpenseEmployee | null> {
    return this.employees.find((employee) => employee.id === id) ?? null;
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
}
