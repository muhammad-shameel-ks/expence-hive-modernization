export type ExpenseRoleCode =
  | "employee"
  | "manager"
  | "it-reviewer"
  | "ceo"
  | "finance-reviewer"
  | "hr";

// Finance and HR share access to Payout Details, Finance Payment View, and Comments.
export const FINANCE_OR_HR_ROLES: ExpenseRoleCode[] = ["finance-reviewer", "hr"];

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

export type ExpensePayoutDetails = {
  accountNumber: string;
  ifscCode: string;
};

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
  subCategory: string;
  remark: string;
  amountMinor: number;
  currency: "INR";
  expenseDate: string;
  status: "draft" | "in-approval" | "needs-correction" | "rejected" | "in-finance" | "paid";
  currentStage?: ExpenseStage;
  currentActorId?: string;
  attachment?: ExpenseAttachment;
  payoutDetails?: ExpensePayoutDetails;
  comments?: string;
  steps: ExpenseStep[];
  history: ExpenseHistoryEvent[];
  version: number;
  createdAt: string;
  submittedAt?: string;
};

export type CreateExpenseDraftInput = {
  title: string;
  category: string;
  subCategory: string;
  remark: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  attachment?: ExpenseAttachmentInput;
  payoutDetails: ExpensePayoutDetails;
};

export interface ExpenseStore {
  getEmployee(id: string): Promise<ExpenseEmployee | null>;
  listEmployees(organizationId: string): Promise<ExpenseEmployee[]>;
  listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]>;
  listClaimsForOrganization(organizationId: string): Promise<ExpenseClaim[]>;
  createClaim(claim: ExpenseClaim): Promise<void>;
  getClaim(id: string): Promise<ExpenseClaim | null>;
  updateClaim(claim: ExpenseClaim): Promise<void>;
}
