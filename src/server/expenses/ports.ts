import type { ReceiptContentType } from "../blob/keys";
import type { AmountGuard } from "../shared/amount-guard";
import type { RoleCapabilities } from "../shared/authorization";

export type ExpenseRole = {
  id: string;
  code: string;
  displayName: string;
  departmentId?: string | null;
  // The six privilege toggles (ADR-0015), resolved from the roles table.
  // Present on records read from the store; absent on legacy data, which
  // resolves to the submit-only default.
  capabilities?: RoleCapabilities | null;
};

export type ExpenseEmployee = {
  id: string;
  organizationId: string;
  name: string;
  departmentId?: string | null;
  role: ExpenseRole | null;
  // The lifecycle flag: deactivated staff are excluded from routing
  // eligibility and treated as vacant when a claim is assigned to them.
  active: boolean;
  // The person this employee reports to, from hierarchy_assignments. This
  // is the named-person target of a 'team-lead' flow step.
  managerId: string | null;
};

export type ExpenseAttachment = {
  id: string;
  fileName: string;
  contentType: ReceiptContentType;
  storageKey: string;
  status: "available";
  contentSha256: string;
  sizeBytes: number;
  uploadedAt: string;
};

export type ReceiptUploadInput = {
  fileName: string;
  contentType: string;
  data: Uint8Array;
};

export type ReceiptData = {
  fileName: string;
  contentType: ReceiptContentType;
  contentSha256: string;
  sizeBytes: number;
  data: Uint8Array;
};

export type ExpenseStepStatus = "pending" | "approved" | "rejected" | "skipped" | "verified" | "paid";

export type ExpenseStep = {
  id: string;
  // The target role of a 'role' step; null for a 'team-lead' step (the
  // assigned named person governs it, not a role).
  roleId: string | null;
  assignedActorId?: string;
  status: ExpenseStepStatus;
  decidedAt?: string;
  // The frozen reason when an amount guard auto-skipped this step at
  // submission (ADR-0012): null/absent for delegation or absence skips.
  skipReason?: string;
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
    | "auto-skipped"
    | "comment"
    | "held"
    | "resumed"
    | "delegated";
  actorId?: string;
  actorName?: string;
  detail?: string;
  createdAt: string;
};

// The subset of history-event kinds that represent a personal action worth
// surfacing in an actor's activity feed: decisions and authored comments,
// not system-generated events (draft/submitted/skipped) or another actor's
// delegation of a stage this actor never touched.
export const ACTIVITY_EVENT_KINDS = [
  "approved",
  "rejected",
  "verified",
  "paid",
  "delegated",
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

// One row of the admin held-claims oversight view (ADR-0016): every held
// claim in an organization with the names resolved for display, so the
// Superadmin console never renders raw ids.
export type HeldClaimRow = {
  claimId: string;
  ref: string;
  title: string;
  heldBy: string;
  heldReason: string;
  heldAt: string;
  stage: string;
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
  // The hold state (ADR-0016): when heldAt is set the claim is paused at
  // its current stage - the flow position is kept, the claim is frozen
  // against terminal actions, and it is exempt from the absence sweep.
  heldAt?: string;
  heldBy?: string;
  heldReason?: string;
  attachment?: ExpenseAttachment;
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
  attachment?: ReceiptUploadInput;
};

// Editing a draft accepts the same fields as creation. An attachment is
// only ever ADDED: replacing the receipt of an existing draft is not
// supported (delete the draft and start over instead).
export type UpdateExpenseDraftInput = CreateExpenseDraftInput;

// The target of one flow step. 'role' steps resolve to eligible holders of
// the role (org-wide, or same-department for the Manager role); 'team-lead'
// steps resolve to the requester's assigned named person from
// hierarchy_assignments.manager_id. Any step may carry an optional amount
// guard; absent or null means unguarded.
export type FlowStepTarget =
  | ({ kind: "role"; roleId: string } | { kind: "team-lead" }) & { guard?: AmountGuard | null };

export type ExpenseFlow = {
  id: string;
  roleId: string;
  steps: FlowStepTarget[];
};

export interface ExpenseStore {
  getEmployee(id: string): Promise<ExpenseEmployee | null>;
  listEmployees(organizationId: string): Promise<ExpenseEmployee[]>;
  listClaimsForEmployee(employee: ExpenseEmployee): Promise<ExpenseClaim[]>;
  listClaimsForOrganization(organizationId: string): Promise<ExpenseClaim[]>;
  createClaim(claim: ExpenseClaim): Promise<void>;
  getClaim(id: string): Promise<ExpenseClaim | null>;
  updateClaim(claim: ExpenseClaim): Promise<void>;
  deleteClaim(id: string, version: number): Promise<void>;
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
