export type ExpenseRole = {
  id: string;
  code: string;
  displayName: string;
  departmentId?: string | null;
};

// Finance reviewer, HR, and Finance Head (the apex financial role) share
// access to Payout Details, Finance Payment View, Comments, and viewing
// another employee's individual activity feed.
export const FINANCE_OR_HR_ROLE_CODES = ["finance-reviewer", "hr", "finance-head"];

// The org-wide activity feed (every employee's decisions and comments, not
// just one person's) is restricted to Finance Head alone, not the broader
// Finance/HR oversight group above.
export const ORGANIZATION_ACTIVITY_ROLE_CODES = ["finance-head"];

export type ExpenseEmployee = {
  id: string;
  organizationId: string;
  name: string;
  departmentId?: string | null;
  role: ExpenseRole | null;
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

export type ExpenseStepStatus = "pending" | "approved" | "rejected" | "skipped" | "verified" | "paid";

export type ExpenseStep = {
  id: string;
  roleId: string;
  assignedActorId?: string;
  status: ExpenseStepStatus;
  decidedAt?: string;
};

export type ExpenseHistoryEvent = {
  id: string;
  kind:
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "verified"
    | "paid"
    | "skipped"
    | "takeover"
    | "comment";
  actorId?: string;
  detail?: string;
  createdAt: string;
};

// The subset of history-event kinds that represent a personal action worth
// surfacing in an actor's activity feed: decisions and authored comments,
// not system-generated events (draft/submitted/skipped) or another actor's
// takeover of a stage this actor never touched.
export const ACTIVITY_EVENT_KINDS = [
  "approved",
  "rejected",
  "verified",
  "paid",
  "takeover",
  "comment",
] as const satisfies readonly ExpenseHistoryEvent["kind"][];

export type ActivityEntry = {
  id: string;
  claimId: string;
  claimRef: string;
  claimTitle: string;
  claimCategory: string;
  claimAmountMinor: number;
  claimCurrency: string;
  requesterId: string;
  requesterName: string;
  actorId: string;
  actorName: string;
  kind: ExpenseHistoryEvent["kind"];
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
  status: "draft" | "in-approval" | "rejected" | "in-finance" | "paid";
  currentStage?: string;
  currentActorId?: string;
  currentStageSince?: string;
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
  subCategory?: string;
  remark?: string;
  amountMinor: number;
  currency: string;
  expenseDate: string;
  attachment?: ExpenseAttachmentInput;
  payoutDetails?: ExpensePayoutDetails;
};

export type ExpenseFlow = {
  id: string;
  roleId: string;
  steps: string[];
};

export interface ExpenseStore {
  getEmployee(id: string): Promise<ExpenseEmployee | null>;
  listEmployees(organizationId: string): Promise<ExpenseEmployee[]>;
  listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]>;
  listClaimsForOrganization(organizationId: string): Promise<ExpenseClaim[]>;
  createClaim(claim: ExpenseClaim): Promise<void>;
  getClaim(id: string): Promise<ExpenseClaim | null>;
  updateClaim(claim: ExpenseClaim): Promise<void>;
  getPublishedFlowForRole(organizationId: string, roleId: string): Promise<ExpenseFlow | null>;
  listActivityForActor(
    organizationId: string,
    actorId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]>;
  listActivityForOrganization(
    organizationId: string,
    kinds: readonly ExpenseHistoryEvent["kind"][],
  ): Promise<ActivityEntry[]>;
}
