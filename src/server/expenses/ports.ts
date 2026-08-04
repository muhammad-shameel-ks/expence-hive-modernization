export type ExpenseRoleCode =
  | "employee"
  | "manager"
  | "it-reviewer"
  | "ceo"
  | "finance-reviewer";

export type ExpenseEmployee = {
  id: string;
  organizationId: string;
  name: string;
  roleCodes: ExpenseRoleCode[];
  managerId?: string;
};

export type ExpenseAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  storageKey: string;
  status: "available";
};

export type ExpenseAttachmentInput = Omit<ExpenseAttachment, "id" | "status">;

export type ExpenseStage = "manager" | "it" | "ceo" | "finance";

export type ExpenseStep = {
  id: string;
  stage: ExpenseStage;
  assignedActorId: string;
  status: "pending" | "approved" | "verified" | "paid";
  decidedAt?: string;
};

export type ExpenseHistoryEvent = {
  id: string;
  kind: "draft" | "submitted" | "approved" | "correction" | "rejected" | "verified" | "paid";
  actorId: string;
  detail?: string;
  createdAt: string;
};

export type ExpenseClaim = {
  id: string;
  ref: string;
  organizationId: string;
  requesterId: string;
  title: string;
  category: string;
  amountMinor: number;
  currency: "INR";
  expenseDate: string;
  paymentMethod: "Personal card" | "Company card";
  status: "draft" | "in-approval" | "needs-correction" | "rejected" | "in-finance" | "paid";
  currentStage?: ExpenseStage;
  currentActorId?: string;
  attachment?: ExpenseAttachment;
  steps: ExpenseStep[];
  history: ExpenseHistoryEvent[];
  version: number;
  createdAt: string;
  submittedAt?: string;
};

export type CreateExpenseDraftInput = {
  title: string;
  category: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  paymentMethod: string;
  attachment?: ExpenseAttachmentInput;
};

export interface ExpenseStore {
  getEmployee(id: string): Promise<ExpenseEmployee | null>;
  listEmployees(organizationId: string): Promise<ExpenseEmployee[]>;
  listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]>;
  createClaim(claim: ExpenseClaim): Promise<void>;
  getClaim(id: string): Promise<ExpenseClaim | null>;
  updateClaim(claim: ExpenseClaim): Promise<void>;
}
