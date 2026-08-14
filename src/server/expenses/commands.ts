import { createHash } from "node:crypto";
import { buildBlobKey } from "../blob/keys";
import type { BlobStore } from "../blob/ports";
import {
  MANAGER_ROLE_CODE,
  SUPERADMIN_ROLE_CODE,
  resolveRoleCapabilities,
} from "../shared/authorization";
import { autoSkipDetail, guardSatisfied } from "../shared/amount-guard";
import { DEFAULT_ABSENCE_TIMEOUT_DAYS } from "../shared/absence-timeout";
import { catchUpAbsentStages, hasActionPrivilege, isTerminalIndex, terminalIndex } from "./absence-skip";
import {
  ACTIVITY_EVENT_KINDS,
  type ActivityEntry,
  type BankDetails,
  type CreateExpenseDraftInput,
  type ExpenseAttachment,
  type ExpenseClaim,
  type ExpenseEmployee,
  type ExpenseStore,
  type FlowStepTarget,
  type ReceiptData,
  type ReceiptUploadInput,
  type UpdateExpenseDraftInput,
} from "./ports";
import { MAX_RECEIPT_SIZE_BYTES, receiptSizeLimitLabel, resolveReceiptContentType } from "./receipt-validation";
import { parsePaymentRegisterData } from "./payment-register-import";

const MAX_REASON_CODE_LENGTH = 200;
// The optional free-text note an approver may attach to an approval
// (ADR-0028): bounded like delegation reasons so the history detail stays a
// short explanation, never a document.
const MAX_APPROVAL_COMMENT_LENGTH = 200;

function canAccessFinance(employee: ExpenseEmployee): boolean {
  return employee.role !== null && resolveRoleCapabilities(employee.role).canAccessFinance;
}

function canViewOrganizationActivity(employee: ExpenseEmployee): boolean {
  return (
    employee.role !== null && resolveRoleCapabilities(employee.role).canViewOrganizationActivity
  );
}

// A claim in the verified state (ADR-0023): it has reached the terminal
// finance stage and that step was verified. Verified is the only waiting
// state - the payment queue renders only these claims, and everything else
// (draft, in-approval, rejected, paid, finance-pending) lives in the
// org-wide finance list view instead.
function isVerifiedClaim(claim: ExpenseClaim): boolean {
  return (
    claim.status === "in-finance" &&
    claim.steps.length > 0 &&
    claim.steps[terminalIndex(claim)].status === "verified"
  );
}

function canSeeClaimComments(claim: ExpenseClaim, viewer: ExpenseEmployee): boolean {
  if (claim.requesterId === viewer.id) return true;
  return canAccessFinance(viewer);
}

function maskClaimComments(claim: ExpenseClaim, viewer: ExpenseEmployee): ExpenseClaim {
  if (canSeeClaimComments(claim, viewer)) return claim;
  const masked = { ...claim };
  delete masked.comments;
  return masked;
}

// Routing eligibility for one flow step target. The requester can never be
// their own approver, deactivated employees are never eligible, a
// 'team-lead' step resolves to the requester's assigned named person from
// hierarchy_assignments (their own role is irrelevant - story 17), and a
// 'role' step resolves to active holders of the role - org-wide, except
// Manager steps which are limited to holders in the requester's department
// (stories 11-13). A requester with no department has no eligible manager,
// so a Manager step for them is vacant and auto-skips.
function isEligible(
  requester: ExpenseEmployee,
  candidate: ExpenseEmployee,
  target: FlowStepTarget,
): boolean {
  if (candidate.id === requester.id) return false;
  if (!candidate.active) return false;
  if (target.kind === "team-lead") {
    return candidate.id === requester.managerId;
  }
  if (candidate.role?.id !== target.roleId) return false;
  if (candidate.role.code === MANAGER_ROLE_CODE) {
    return candidate.departmentId !== null && candidate.departmentId === requester.departmentId;
  }
  return true;
}

function stepTarget(step: ExpenseClaim["steps"][number]): FlowStepTarget {
  return step.roleId === null ? { kind: "team-lead" } : { kind: "role", roleId: step.roleId };
}

// Delegation honors the re-pointed person at their landed stage (ADR-0017):
// the delegated assignee may act on the step even when their role would not
// normally be eligible - a cross-department Manager, or a role absent from
// the claim's frozen steps. Pool members keep acting via isEligible; the
// step's assigned actor is always eligible.
function canActOnStep(
  requester: ExpenseEmployee,
  actor: ExpenseEmployee,
  step: ExpenseClaim["steps"][number],
): boolean {
  return isEligible(requester, actor, stepTarget(step)) || actor.id === step.assignedActorId;
}


// The delegation history detail names the delegatee by display name (and
// role when they carry one): the audit trail must read the re-routed person
// without raw ids, mirroring how other events resolve display names.
function delegationDetail(delegatee: ExpenseEmployee, reason: string): string {
  const role = delegatee.role ? ` (${delegatee.role.displayName})` : "";
  return `Delegated to ${delegatee.name}${role} for "${reason}"`;
}

// One intermediate step auto-skipped by a positional delegation (ADR-0017):
// the step is stamped skipped and a 'skipped' event names the delegation so
// the timeline explains why the stage was passed over.
function delegationSkipDetail(delegatee: ExpenseEmployee): string {
  return `Skipped: delegated to ${delegatee.name}`;
}

export type ExpenseErrorCode = "unauthorized" | "validation" | "not-found" | "conflict" | "too-large";

export class ExpenseError extends Error {
  constructor(readonly code: ExpenseErrorCode, message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

export function isExpenseError(error: unknown): error is ExpenseError {
  return error instanceof ExpenseError;
}

// The bulk-pay skip reasons (ADR-0023): every selected claim is validated
// at execution and ineligible rows are skipped and reported, so a run with
// mixed rows still completes (partial success is the expected outcome).
// The reasons are the shared vocabulary of the bulk command's report and
// the single-claim command's errors.
export type BulkPaySkipReason =
  // No claim with this id exists in the actor's organization.
  | "not-found"
  // The actor is the claim's requester.
  | "self-claim"
  // The actor does not hold the terminal step (pool eligibility failed).
  | "not-eligible"
  // The claim is already paid.
  | "already-paid"
  // In-flight, but the terminal step is not verified yet.
  | "not-verified"
  // Another writer changed the claim between the check and the write.
  | "conflict";

/** One selected claim the bulk run refused to pay, with the reason. */
export type BulkPaySkippedClaim = {
  claimId: string;
  reason: BulkPaySkipReason;
  message: string;
};

/** The per-claim outcome of a bulk payment run (ADR-0023). */
export type BulkPayReport = {
  paid: ExpenseClaim[];
  skipped: BulkPaySkippedClaim[];
};

// The bulk-approve skip reasons (ADR-0029): every selected claim is validated
// at execution and ineligible rows are skipped and reported, so a run with
// mixed rows still completes (partial success is the expected outcome).
export type BulkApproveSkipReason =
  // No claim with this id exists in the actor's organization.
  | "not-found"
  // The actor is the claim's requester.
  | "self-claim"
  // The actor is not assigned or eligible to act on the current step.
  | "not-eligible"
  // The claim is not waiting for an approval decision (e.g. draft, verified, paid, rejected).
  | "not-in-approval"
  // Another writer changed the claim between the check and the write.
  | "conflict";

/** One selected claim the bulk run refused to approve, with the reason. */
export type BulkApproveSkippedClaim = {
  claimId: string;
  reason: BulkApproveSkipReason;
  message: string;
};

/** The per-claim outcome of a bulk approval run (ADR-0029). */
export type BulkApproveReport = {
  approved: ExpenseClaim[];
  skipped: BulkApproveSkippedClaim[];
};

function bulkApproveSkipMessage(reason: BulkApproveSkipReason): string {
  switch (reason) {
    case "not-found":
      return "Expense claim does not exist.";
    case "self-claim":
      return "You cannot approve your own expense claim.";
    case "not-eligible":
      return "You are not eligible to approve this claim's current stage.";
    case "not-in-approval":
      return "This claim is not waiting for an approval decision.";
    case "conflict":
      return "This claim was modified by another action.";
  }
}

// The register import conflict buckets (ADR-0023): a file row that matched
// a claim which is no longer payable - either already paid, or still
// in-flight without a verified terminal step. Both are reported so finance
// can reconcile the run before paying.
export type PaymentRegisterImportConflictReason = "already-paid" | "not-verified";

export type PaymentRegisterImportConflict = {
  claim: ExpenseClaim;
  reason: PaymentRegisterImportConflictReason;
};

/** The row-level result of a register drag-back import (ADR-0023). */
export type PaymentRegisterImportReport = {
  /** Verified claims the queue can auto-select. */
  matched: ExpenseClaim[];
  /** File rows whose claim exists but is not payable anymore. */
  conflicts: PaymentRegisterImportConflict[];
  /** File rows with no claim in this organization. */
  unknownIds: string[];
};

type IdFactory = (prefix: string) => string;

// Resolves an organization's configured absence auto-skip timeout (the
// settings seam lives on the admin store, ADR-0018). The expense commands
// read the value through this seam so the lazy read path and the sweep
// worker always enforce the same configured timeout.
export type AbsenceTimeoutReader = {
  getAbsenceTimeoutDays(organizationId: string): Promise<number>;
};

export type ExpenseCommands = {
  createDraft(actorId: string, input: CreateExpenseDraftInput): Promise<ExpenseClaim>;
  updateDraft(actorId: string, claimId: string, input: UpdateExpenseDraftInput): Promise<ExpenseClaim>;
  deleteDraft(actorId: string, claimId: string): Promise<void>;
  getReceipt(actorId: string, claimId: string): Promise<ReceiptData>;
  getClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  /** Authorized input bundle for the expense summary PDF: the (comment-masked) claim, the organization's employees, and the receipt when one exists. */
  getExpenseSummary(
    actorId: string,
    claimId: string,
  ): Promise<{ claim: ExpenseClaim; employees: ExpenseEmployee[]; receipt?: ReceiptData }>;
  listClaims(actorId: string): Promise<ExpenseClaim[]>;
  getWorkspace(actorId: string): Promise<{ employee: ExpenseEmployee; employees: ExpenseEmployee[]; claims: ExpenseClaim[] }>;
  listEmployees(actorId: string): Promise<ExpenseEmployee[]>;
  submitClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  // The optional comment (ADR-0028) is recorded on the 'approved' history
  // event with actor and timestamp, mirroring the rejection reason
  // (ADR-0009): it is never written into the claim's comments field, which
  // stays Finance-only via updateComments.
  approveStage(actorId: string, claimId: string, comment?: string): Promise<ExpenseClaim>;
  // Bulk approval (ADR-0029): every selected claim is validated at execution
  // (in-approval state, not self-claim, stage eligibility) and eligible rows
  // are approved with their own 'approved' history events (carrying the optional
  // comment); ineligible rows are skipped and reported.
  approveClaims(actorId: string, claimIds: string[], comment?: string): Promise<BulkApproveReport>;
  // The approvals queue read (ADR-0029): every claim in the organization currently
  // awaiting this approver's action at their approval stage. Gated on the canApprove
  // privilege.
  listApprovalsQueue(actorId: string): Promise<ExpenseClaim[]>;
  rejectClaim(actorId: string, claimId: string, reason: string): Promise<ExpenseClaim>;
  // Delegation (ADR-0017): the Superadmin re-points an in-flight claim's
  // current task to another specific person without acting on it. A
  // required reason is recorded as a 'delegated' event; when the
  // delegatee's role appears at a later pending step, the intermediate
  // pending steps are each auto-skipped with their own 'skipped' event and
  // the claim lands at that step.
  delegateClaim(actorId: string, claimId: string, delegateeId: string, reason: string): Promise<ExpenseClaim>;
  verifyClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  markPaid(actorId: string, claimId: string): Promise<ExpenseClaim>;
  // Bulk payment (ADR-0023): every claim id is validated at execution
  // (verified state, not already paid, terminal-pool eligibility) and the
  // eligible rows are paid with their own 'paid' history events; ineligible
  // rows are skipped and reported. Partial success is the expected outcome,
  // and a re-run of the same ids pays nothing new.
  markClaimsPaid(actorId: string, claimIds: string[]): Promise<BulkPayReport>;
  // The drag-back import (ADR-0023): parses the uploaded register Excel
  // server-side (never in the browser), validates it against the slice-06
  // format contract, and returns the matching verified claims plus a
  // row-level report of unknown ids and no-longer-payable claims.
  importPaymentRegister(actorId: string, data: Uint8Array): Promise<PaymentRegisterImportReport>;
  listFinancePaymentQueue(actorId: string): Promise<ExpenseClaim[]>;
  // The approved bank details of every employee of the organization, for
  // the payment-register export (ADR-0023): the register carries the
  // account each claim will be paid to (ADR-0024). Gated on finance access
  // like the queue read; the details are read live at export time.
  listFinanceApprovedBankDetails(
    actorId: string,
  ): Promise<Array<{ employeeId: string; details: BankDetails }>>;
  updateComments(actorId: string, claimId: string, comments: string): Promise<ExpenseClaim>;
  listActivity(actorId: string, targetEmployeeId?: string): Promise<ActivityEntry[]>;
  listOrganizationActivity(actorId: string): Promise<ActivityEntry[]>;
  // The org-wide finance expense list read (ADR-0023): every claim in the
  // organization at every stage, for roles carrying the view-org-wide-activity
  // privilege. The list surface is read-only - there is no mutation in this
  // read. Distinct from listClaims, which is viewer-scoped.
  listOrganizationClaims(actorId: string): Promise<ExpenseClaim[]>;
  // System-level absence sweep (ADR-0018): enforces the organization's
  // configured absence timeout across all of its in-flight claims, applying
  // the exact same catch-up as the lazy read path and persisting the
  // resulting skips. Not an actor command: the scheduled sweep worker calls
  // it with no employee context. Returns the claims it advanced.
  sweepAbsentClaims(organizationId: string): Promise<ExpenseClaim[]>;
};

export function createExpenseCommands({
  store,
  blobStore,
  now = () => new Date(),
  idFactory = (prefix) => `${prefix}-${crypto.randomUUID()}`,
  absenceTimeout,
}: {
  store: ExpenseStore;
  blobStore: BlobStore;
  now?: () => Date;
  idFactory?: IdFactory;
  // The settings seam (ADR-0018): without it the 3-day default applies,
  // which is also what the seam resolves for an organization with no
  // settings row yet.
  absenceTimeout?: AbsenceTimeoutReader;
}): ExpenseCommands {
  async function requireEmployee(actorId: string): Promise<ExpenseEmployee> {
    const employee = await store.getEmployee(actorId);
    if (!employee || !employee.active) {
      throw new ExpenseError("unauthorized", "The current user is not an active employee.");
    }
    return employee;
  }

  async function absenceTimeoutDaysFor(organizationId: string): Promise<number> {
    if (!absenceTimeout) return DEFAULT_ABSENCE_TIMEOUT_DAYS;
    return absenceTimeout.getAbsenceTimeoutDays(organizationId);
  }

  // The runtime half of amount guards (ADR-0012): after a claim's steps
  // materialize from the published flow at submission, each guarded step is
  // evaluated against the claim total and the outcome is frozen in the
  // claim's step snapshot. A step whose guard fails is auto-skipped - the
  // policy decided it, not a person - so the skip is recorded as a distinct
  // 'auto-skipped' history event with no actor and the guard reason
  // (ADR-0013). The terminal step is never auto-skipped: flow validation
  // already rejects a guarded terminal step, and this is the runtime
  // backstop so payment completion can never be silently bypassed.
  function applyAmountGuards(
    claim: ExpenseClaim,
    steps: FlowStepTarget[],
    roleNames: Map<string, string>,
    decidedAt: string,
  ): void {
    for (let index = 0; index < claim.steps.length; index += 1) {
      const guard = steps[index].guard;
      if (!guard || isTerminalIndex(claim, index)) continue;
      if (guardSatisfied(guard, claim.amountMinor)) continue;
      const step = claim.steps[index];
      step.status = "skipped";
      step.decidedAt = decidedAt;
      const stepRoleName =
        step.roleId === null ? "team lead" : (roleNames.get(step.roleId) ?? step.roleId);
      step.skipReason = autoSkipDetail(claim.amountMinor, guard, stepRoleName);
      claim.history.push({
        id: idFactory("history"),
        kind: "auto-skipped",
        actorName: "Policy",
        detail: step.skipReason,
        createdAt: decidedAt,
      });
    }
  }

  // The lazy read-path backstop (ADR-0018): every claim read catches the
  // claim up against the org's configured absence timeout before the caller
  // sees it, so the read path behaves identically whether or not the
  // scheduled sweep has run. The shared catch-up lives in absence-skip.ts;
  // this wrapper resolves the timeout, bumps the version, and persists.
  async function catchUp(claim: ExpenseClaim): Promise<ExpenseClaim> {
    const [employees, absenceTimeoutDays] = await Promise.all([
      store.listEmployees(claim.organizationId),
      absenceTimeoutDaysFor(claim.organizationId),
    ]);
    if (catchUpAbsentStages(claim, employees, absenceTimeoutDays, now, idFactory)) {
      claim.version += 1;
      await store.updateClaim(claim);
    }
    return claim;
  }

  async function catchUpAll(claims: ExpenseClaim[], organizationId: string): Promise<ExpenseClaim[]> {
    if (claims.length === 0) return claims;
    const [employees, absenceTimeoutDays] = await Promise.all([
      store.listEmployees(organizationId),
      absenceTimeoutDaysFor(organizationId),
    ]);
    for (const claim of claims) {
      if (catchUpAbsentStages(claim, employees, absenceTimeoutDays, now, idFactory)) {
        claim.version += 1;
        await store.updateClaim(claim);
      }
    }
    return claims;
  }

  async function requireClaim(actorId: string, claimId: string): Promise<ExpenseClaim> {
    const employee = await requireEmployee(actorId);
    const claim = await store.getClaim(claimId);
    if (!claim || claim.organizationId !== employee.organizationId) {
      throw new ExpenseError("not-found", "Expense claim does not exist.");
    }
    if (claim.requesterId !== actorId) {
      throw new ExpenseError("unauthorized", "You cannot access this expense claim.");
    }
    return catchUp(claim);
  }

  // Broader than requireClaim: anyone who has ever acted on a claim (an
  // approver, even after it has moved past their stage) remains authorized
  // to look up its detail, alongside the requester, the currently assigned
  // actor, and Finance's standing oversight access. This is read-only.
  // Mutation commands keep using the stricter requireClaim/requireAssignedClaim.
  async function requireViewableClaim(actorId: string, claimId: string): Promise<ExpenseClaim> {
    const employee = await requireEmployee(actorId);
    const claimRow = await store.getClaim(claimId);
    if (!claimRow || claimRow.organizationId !== employee.organizationId) {
      throw new ExpenseError("not-found", "Expense claim does not exist.");
    }
    const claim = await catchUp(claimRow);
    const isRequester = claim.requesterId === actorId;
    const isCurrentActor = claim.currentActorId === actorId;
    const actedBefore = claim.history.some((event) => event.actorId === actorId);
    if (!isRequester && !isCurrentActor && !actedBefore && !canAccessFinance(employee)) {
      throw new ExpenseError("unauthorized", "You cannot access this expense claim.");
    }
    return claim;
  }

  // Shared mutation precondition: an active actor of the claim's organization
  // acting on a claim they did not raise. The caller adds the stage-specific
  // authority check (assignment or pool eligibility).
  async function requireClaimForActor(
    actorId: string,
    claimId: string,
    selfClaimMessage: string,
  ): Promise<{ actor: ExpenseEmployee; claim: ExpenseClaim }> {
    const actor = await requireEmployee(actorId);
    const claimRow = await store.getClaim(claimId);
    if (!claimRow || claimRow.organizationId !== actor.organizationId) {
      throw new ExpenseError("not-found", "Expense claim does not exist.");
    }
    const claim = await catchUp(claimRow);
    if (claim.requesterId === actorId) {
      throw new ExpenseError("unauthorized", selfClaimMessage);
    }
    return { actor, claim };
  }

  async function requireAssignedClaim(actorId: string, claimId: string): Promise<ExpenseClaim> {
    const { claim } = await requireClaimForActor(actorId, claimId, "You cannot approve your own expense claim.");
    if (claim.currentActorId !== actorId) {
      throw new ExpenseError("unauthorized", "This expense claim is not assigned to you.");
    }
    return claim;
  }

  // The bulk-pay skip reasons (ADR-0023): every selected claim is validated
  // at execution and ineligible rows are skipped and reported, so a run
  // with mixed rows still completes (partial success is the expected
  // outcome). The module-level BulkPaySkipReason type is the shared
  // vocabulary of the bulk report and the single-claim command's errors.
  function bulkPaySkipMessage(reason: BulkPaySkipReason): string {
    switch (reason) {
      case "not-found":
        return "Expense claim does not exist.";
      case "self-claim":
        return "You cannot verify or pay your own expense claim.";
      case "not-eligible":
        return "You are not eligible to process this claim's terminal stage.";
      case "already-paid":
        return "This claim is already paid.";
      case "not-verified":
        return "This claim is not verified and cannot be paid.";
      case "conflict":
        return "This claim changed before it could be paid.";
    }
  }

  // The non-throwing half of the terminal-pool authority check: the bulk
  // command runs it per claim to build its skip report, while the single
  // claim commands map the failures back to ExpenseError codes. Sharing one
  // implementation keeps the single-claim eligibility and the bulk
  // eligibility from drifting apart (the slice-08 contract).
  type TerminalPoolCheck =
    | { ok: true; actor: ExpenseEmployee; claim: ExpenseClaim; step: ExpenseClaim["steps"][number] }
    | { ok: false; reason: BulkPaySkipReason };

  async function terminalPoolCheck(actorId: string, claimId: string): Promise<TerminalPoolCheck> {
    const actor = await requireEmployee(actorId);
    const claimRow = await store.getClaim(claimId);
    if (!claimRow || claimRow.organizationId !== actor.organizationId) {
      return { ok: false, reason: "not-found" };
    }
    const claim = await catchUp(claimRow);
    if (claim.requesterId === actorId) {
      return { ok: false, reason: "self-claim" };
    }
    const index = terminalIndex(claim);
    const step = claim.steps[index];
    const employees = await store.listEmployees(claim.organizationId);
    const requester = employees.find((candidate) => candidate.id === claim.requesterId);
    if (!requester || !step || !canActOnStep(requester, actor, step)) {
      return { ok: false, reason: "not-eligible" };
    }
    return { ok: true, actor, claim, step };
  }

  async function requireTerminalPoolClaim(
    actorId: string,
    claimId: string,
  ): Promise<{ actor: ExpenseEmployee; claim: ExpenseClaim; step: ExpenseClaim["steps"][number] }> {
    const check = await terminalPoolCheck(actorId, claimId);
    if (!check.ok) {
      if (check.reason === "not-found") {
        throw new ExpenseError("not-found", "Expense claim does not exist.");
      }
      if (check.reason === "self-claim") {
        throw new ExpenseError("unauthorized", "You cannot verify or pay your own expense claim.");
      }
      throw new ExpenseError("unauthorized", "You are not eligible to process this claim's terminal stage.");
    }
    return check;
  }

  // The shared payment transition (ADR-0023): stamps the terminal step
  // paid, records the claim's own 'paid' history event with actor and
  // timestamp, and moves the claim to its terminal paid state. Both the
  // single-claim markPaid and the bulk run apply this exact transition so
  // the audit trail of a bulk-paid claim is identical to a one-off payment.
  function applyPayment(
    claim: ExpenseClaim,
    step: ExpenseClaim["steps"][number],
    actorId: string,
    paidAt: string,
  ): void {
    step.status = "paid";
    step.decidedAt = paidAt;
    claim.history.push({ id: idFactory("history"), kind: "paid", actorId, detail: "Payment marked complete", createdAt: paidAt });
    claim.status = "paid";
    claim.currentStage = undefined;
    claim.currentActorId = undefined;
    claim.version += 1;
  }

  // The shared approval transition (ADR-0029): stamps the current step
  // approved, records the claim's own 'approved' history event with actor,
  // optional comment, and timestamp, advances the claim to its next pending
  // step (or terminal in-finance state), and bumps the claim version. Both the
  // single-claim approveStage and the bulk run apply this exact transition so
  // the audit trail of a bulk-approved claim is identical to a one-off approval.
  function applyApproval(
    claim: ExpenseClaim,
    index: number,
    actorId: string,
    decidedAt: string,
    trimmedComment: string,
  ): void {
    const step = claim.steps[index];
    step.status = "approved";
    step.decidedAt = decidedAt;
    claim.history.push({
      id: idFactory("history"),
      kind: "approved",
      actorId,
      ...(trimmedComment ? { detail: trimmedComment } : {}),
      createdAt: decidedAt,
    });
    const nextIndex = claim.steps.findIndex(
      (candidate, candidateIndex) => candidateIndex > index && candidate.status === "pending",
    );
    const next = claim.steps[nextIndex];
    claim.currentStage = next?.roleId ?? undefined;
    claim.currentActorId = next?.assignedActorId;
    claim.currentStageSince = decidedAt;
    claim.status = isTerminalIndex(claim, nextIndex) ? "in-finance" : "in-approval";
    claim.version += 1;
  }

  // Uploads receipt bytes to a claim-scoped key and returns the attachment
  // record. The server is authoritative over the receipt format: the
  // browser's declared type must match the sniffed magic bytes (ADR-0004).
  // The bytes land before the claim row changes; callers compensate with a
  // best-effort blob delete when their store write fails (ADR-0005).
  async function uploadReceipt(
    input: ReceiptUploadInput,
    organizationId: string,
    claimId: string,
    uploadedAt: string,
  ): Promise<ExpenseAttachment> {
    const contentType = resolveReceiptContentType(input.contentType, input.data);
    if (contentType === null) {
      throw new ExpenseError("validation", "Receipts must be a PDF file.");
    }
    if (input.data.byteLength > MAX_RECEIPT_SIZE_BYTES) {
      throw new ExpenseError("too-large", `The receipt is larger than ${receiptSizeLimitLabel()}.`);
    }
    const contentSha256 = createHash("sha256").update(input.data).digest("hex");
    const attachmentId = idFactory("attachment");
    const storageKey = buildBlobKey(organizationId, claimId, attachmentId, contentType);
    await blobStore.putBlob(storageKey, input.data, contentType);
    return {
      id: attachmentId,
      fileName: input.fileName,
      contentType,
      storageKey,
      status: "available",
      contentSha256,
      sizeBytes: input.data.byteLength,
      uploadedAt,
    };
  }

  // Best-effort compensating delete for a failed store write after the
  // bytes landed (ADR-0005): the claim never references a blob it does not
  // own. The original failure always propagates.
  async function compensateBlob(attachment: ExpenseAttachment | undefined): Promise<void> {
    if (!attachment) return;
    try {
      await blobStore.deleteBlob(attachment.storageKey);
    } catch {
      // The orphan blob is unreachable from any claim and can be swept later.
    }
  }

  // Reads and integrity-checks the claim's receipt bytes (ADR-0005).
  // With throwIfMissing the caller gets the not-found error; without it a
  // missing or unavailable receipt simply yields undefined so optional
  // consumers (the summary PDF) never abort for lack of a receipt.
  async function readReceiptBytes(claim: ExpenseClaim, throwIfMissing: true): Promise<ReceiptData>;
  async function readReceiptBytes(claim: ExpenseClaim, throwIfMissing: false): Promise<ReceiptData | undefined>;
  async function readReceiptBytes(
    claim: ExpenseClaim,
    throwIfMissing: boolean,
  ): Promise<ReceiptData | undefined> {
    const missing = (message: string): never => {
      if (!throwIfMissing) return undefined as never;
      throw new ExpenseError("not-found", message);
    };
    if (!claim.attachment) return missing("This claim has no receipt.");
    const blob = await blobStore.getBlob(claim.attachment.storageKey);
    if (!blob) return missing("The receipt is unavailable.");
    const contentSha256 = createHash("sha256").update(blob.data).digest("hex");
    if (
      contentSha256 !== claim.attachment.contentSha256 ||
      blob.data.byteLength !== claim.attachment.sizeBytes
    ) {
      return missing("The receipt is unavailable.");
    }
    return {
      fileName: claim.attachment.fileName,
      contentType: claim.attachment.contentType,
      contentSha256,
      sizeBytes: blob.data.byteLength,
      data: blob.data,
    };
  }

  return {
    async createDraft(actorId, input) {
      const employee = await requireEmployee(actorId);
      validateDraft(input);
      const createdAt = now().toISOString();
      const claimId = idFactory("claim");
      let attachment: ExpenseAttachment | undefined;
      if (input.attachment) {
        attachment = await uploadReceipt(input.attachment, employee.organizationId, claimId, createdAt);
      }
      const claim: ExpenseClaim = {
        id: claimId,
        ref: `EXP-${createdAt.slice(0, 4)}-${claimId.replace(/^claim-/, "").slice(-8).toUpperCase()}`,
        organizationId: employee.organizationId,
        requesterId: actorId,
        title: input.title.trim(),
        category: input.category.trim(),
        subCategory: (input.subCategory ?? "").trim(),
        remark: (input.remark ?? "").trim(),
        amountMinor: input.amountMinor,
        currency: "INR",
        expenseDate: input.expenseDate,
        status: "draft",
        attachment,
        steps: [],
        history: [{ id: idFactory("history"), kind: "draft", actorId, createdAt }],
        version: 1,
        createdAt,
      };
      try {
        await store.createClaim(claim);
      } catch (error) {
        await compensateBlob(attachment);
        throw error;
      }
      return claim;
    },

    async updateDraft(actorId, claimId, input) {
      const claim = await requireClaim(actorId, claimId);
      if (claim.status !== "draft") {
        throw new ExpenseError("conflict", "Only a draft claim can be edited.");
      }
      validateDraft(input);
      // Only a newly uploaded receipt is compensated on failure; a kept
      // attachment's blob must never be deleted while its row survives.
      let addedAttachment: ExpenseAttachment | undefined;
      if (input.attachment) {
        if (claim.attachment?.contentSha256) {
          throw new ExpenseError(
            "validation",
            "This draft already has a receipt. Delete the draft to start over with a different receipt.",
          );
        }
        addedAttachment = await uploadReceipt(input.attachment, claim.organizationId, claimId, now().toISOString());
        if (claim.attachment) {
          // A legacy placeholder row (empty digest, migration 0019) has no
          // stored object behind it: keep its id so the pg upsert replaces
          // the row in place instead of leaving two attachment rows.
          claim.attachment = { ...addedAttachment, id: claim.attachment.id };
        } else {
          claim.attachment = addedAttachment;
        }
      }
      claim.title = input.title.trim();
      claim.category = input.category.trim();
      claim.subCategory = (input.subCategory ?? "").trim();
      claim.remark = (input.remark ?? "").trim();
      claim.amountMinor = input.amountMinor;
      claim.expenseDate = input.expenseDate;
      claim.version += 1;
      try {
        await store.updateClaim(claim);
      } catch (error) {
        await compensateBlob(addedAttachment);
        throw error;
      }
      return claim;
    },

    async deleteDraft(actorId, claimId) {
      const claim = await requireClaim(actorId, claimId);
      if (claim.status !== "draft") {
        throw new ExpenseError("conflict", "Only a draft claim can be deleted.");
      }
      await store.deleteClaim(claim.id, claim.version);
      // The attachment row cascades away with the claim; the stored bytes
      // are removed best-effort so an orphan blob never blocks the delete.
      await compensateBlob(claim.attachment);
    },

    async getReceipt(actorId, claimId) {
      const claim = await requireViewableClaim(actorId, claimId);
      if (!claim.attachment) {
        throw new ExpenseError("not-found", "This claim has no receipt.");
      }
      return readReceiptBytes(claim, true);
    },

    async getClaim(actorId, claimId) {
      const employee = await requireEmployee(actorId);
      const claim = await requireViewableClaim(actorId, claimId);
      return maskClaimComments(claim, employee);
    },

    async getExpenseSummary(actorId, claimId) {
      const employee = await requireEmployee(actorId);
      const claim = await requireViewableClaim(actorId, claimId);
      const [employees, receipt] = await Promise.all([
        store.listEmployees(employee.organizationId),
        // The receipt is optional: a claim may proceed without one, and the
        // summary PDF then simply carries no attachment. Comment masking is
        // preserved (requester/Finance only), so a summary PDF exposes no
        // more than the app already does.
        readReceiptBytes(claim, false),
      ]);
      return { claim: maskClaimComments(claim, employee), employees, receipt };
    },

    async listClaims(actorId) {
      const employee = await requireEmployee(actorId);
      const claims = await catchUpAll(await store.listClaimsForEmployee(employee), employee.organizationId);
      return claims.map((claim) => maskClaimComments(claim, employee));
    },

    async getWorkspace(actorId) {
      const employee = await requireEmployee(actorId);
      const [employees, rawClaims] = await Promise.all([
        store.listEmployees(employee.organizationId),
        store.listClaimsForEmployee(employee),
      ]);
      const claims = await catchUpAll(rawClaims, employee.organizationId);
      return { employee, employees, claims: claims.map((claim) => maskClaimComments(claim, employee)) };
    },

    async listEmployees(actorId) {
      const employee = await requireEmployee(actorId);
      return store.listEmployees(employee.organizationId);
    },

    async submitClaim(actorId, claimId) {
      const claim = await requireClaim(actorId, claimId);
      if (claim.status !== "draft") {
        throw new ExpenseError("conflict", "Only a draft claim can be submitted.");
      }
      const requester = await requireEmployee(actorId);
      if (!requester.role) {
        throw new ExpenseError("validation", "You need an assigned role before you can submit a reimbursement.");
      }
      // Submitting is a per-role privilege (ADR-0015): the requester's own
      // role must carry the can_submit capability, resolved from the role
      // record. Superadmin holds it by construction.
      if (!resolveRoleCapabilities(requester.role).canSubmit) {
        throw new ExpenseError("unauthorized", "Your role does not have the submit privilege.");
      }
      const flow = await store.getPublishedFlowForRole(requester.organizationId, requester.role.id);
      if (!flow || flow.steps.length === 0) {
        throw new ExpenseError("validation", "No approval flow is published for your role yet.");
      }
      // A claim cannot enter the approval pipeline without its receipt:
      // without it there is nothing to reimburse against (ADR-0022).
      // Drafts may still exist receipt-less (autosave, resumed legacy drafts),
      // but submission is the enforcement point.
      if (!claim.attachment) {
        throw new ExpenseError("validation", "A receipt is required before this claim can be submitted.");
      }
      // Submission gate (ADR-0024): drafts may be created without bank
      // details, but the first submission is blocked until an approved bank
      // detail record exists, with a pointer to the profiles page. Enforced
      // server-side; the UI never needs to duplicate this authority.
      const approvedBankDetails = await store.getApprovedBankDetails(requester.id);
      if (!approvedBankDetails) {
        throw new ExpenseError(
          "validation",
          "Approved bank details are required before submitting a claim. Add them on your profile page.",
        );
      }
      const employees = await store.listEmployees(requester.organizationId);
      const roleNames = new Map(
        employees.flatMap((employee) =>
          employee.role ? [[employee.role.id, employee.role.displayName] as const] : [],
        ),
      );
      const submittedAt = now().toISOString();
      claim.steps = flow.steps.map((target) => {
        const eligible = employees.find((candidate) => isEligible(requester, candidate, target));
        return {
          id: idFactory("step"),
          roleId: target.kind === "role" ? target.roleId : null,
          assignedActorId: eligible?.id,
          status: "pending" as const,
        };
      });
      claim.submittedAt = submittedAt;
      claim.version += 1;
      claim.history.push({ id: idFactory("history"), kind: "submitted", actorId, createdAt: submittedAt });
      // Guards are evaluated at submission and the outcome is frozen with
      // the claim: later flow edits cannot change it, and a fresh
      // submission (e.g. a new claim after a rejection) re-evaluates.
      applyAmountGuards(claim, flow.steps, roleNames, submittedAt);
      // The first pending step is current: guarded steps that were
      // auto-skipped never hold the claim up.
      const currentIndex = Math.max(
        claim.steps.findIndex((step) => step.status === "pending"),
        0,
      );
      claim.status = isTerminalIndex(claim, currentIndex) ? "in-finance" : "in-approval";
      claim.currentStage = claim.steps[currentIndex].roleId ?? undefined;
      claim.currentActorId = claim.steps[currentIndex].assignedActorId;
      claim.currentStageSince = submittedAt;
      await catchUpAbsentStages(
        claim,
        employees,
        await absenceTimeoutDaysFor(claim.organizationId),
        now,
        idFactory,
      );
      await store.updateClaim(claim);
      return claim;
    },

    async approveStage(actorId, claimId, comment) {
      const actor = await requireEmployee(actorId);
      const claimRow = await store.getClaim(claimId);
      if (!claimRow || claimRow.organizationId !== actor.organizationId) {
        throw new ExpenseError("not-found", "Expense claim does not exist.");
      }
      const claim = await catchUp(claimRow);
      if (claim.requesterId === actorId) {
        throw new ExpenseError("unauthorized", "You cannot approve your own expense claim.");
      }
      const index = claim.steps.findIndex((step) => step.status === "pending");
      if (index === -1 || isTerminalIndex(claim, index) || claim.status !== "in-approval") {
        throw new ExpenseError("conflict", "This claim is not waiting for an approval decision.");
      }
      // The approval comment is optional free text (ADR-0028): an approval
      // without one is valid, whitespace-only input is treated as absent,
      // and an oversized comment is refused before anything is written.
      const trimmedComment = comment?.trim() ?? "";
      if (trimmedComment.length > MAX_APPROVAL_COMMENT_LENGTH) {
        throw new ExpenseError("validation", "Comment is too long.");
      }
      // Pool semantics (stories 13/14): any eligible pool member may approve
      // the current stage, not only the member it was assigned to. The
      // assignment is the default actor; the pool is the authority.
      const requester = (await store.listEmployees(claim.organizationId)).find(
        (candidate) => candidate.id === claim.requesterId,
      );
      if (!requester || !canActOnStep(requester, actor, claim.steps[index])) {
        throw new ExpenseError("unauthorized", "You are not eligible to approve this claim's current stage.");
      }
      const decidedAt = now().toISOString();
      applyApproval(claim, index, actorId, decidedAt, trimmedComment);
      const employees = await store.listEmployees(claim.organizationId);
      await catchUpAbsentStages(
        claim,
        employees,
        await absenceTimeoutDaysFor(claim.organizationId),
        now,
        idFactory,
      );
      await store.updateClaim(claim);
      return claim;
    },

    async approveClaims(actorId, claimIds, comment) {
      const actor = await requireEmployee(actorId);
      // Bulk approval rides the canApprove / canAccessFinance privilege (ADR-0029):
      // any role carrying approval capability may execute a bulk approval run.
      const caps = resolveRoleCapabilities(actor.role);
      if (!caps.canApprove && !caps.canAccessFinance) {
        throw new ExpenseError("unauthorized", "Only approvers can approve claims.");
      }
      const trimmedComment = comment?.trim() ?? "";
      if (trimmedComment.length > MAX_APPROVAL_COMMENT_LENGTH) {
        throw new ExpenseError("validation", "Comment is too long.");
      }
      const approved: ExpenseClaim[] = [];
      const skipped: BulkApproveSkippedClaim[] = [];
      const employees = await store.listEmployees(actor.organizationId);
      const requesterById = new Map(employees.map((candidate) => [candidate.id, candidate]));
      const timeoutDays = await absenceTimeoutDaysFor(actor.organizationId);

      // Duplicate ids in the batch are approved once: the report never lists a
      // claim twice, and a re-run of the same ids is idempotent.
      for (const claimId of Array.from(new Set(claimIds))) {
        const claimRow = await store.getClaim(claimId);
        if (!claimRow || claimRow.organizationId !== actor.organizationId) {
          skipped.push({ claimId, reason: "not-found", message: bulkApproveSkipMessage("not-found") });
          continue;
        }
        if (claimRow.requesterId === actorId) {
          skipped.push({ claimId, reason: "self-claim", message: bulkApproveSkipMessage("self-claim") });
          continue;
        }
        const claim = await catchUp(claimRow);
        if (claim.status !== "in-approval" && claim.status !== "in-finance") {
          skipped.push({ claimId, reason: "not-in-approval", message: bulkApproveSkipMessage("not-in-approval") });
          continue;
        }

        const decidedAt = now().toISOString();
        if (claim.status === "in-finance") {
          const index = terminalIndex(claim);
          const step = claim.steps[index];
          const isEligible = Boolean(
            step &&
            actor.role &&
            step.roleId === actor.role.id &&
            (step.status === "pending" || step.status === "verified"),
          );
          if (!isEligible) {
            skipped.push({ claimId, reason: "not-eligible", message: bulkApproveSkipMessage("not-eligible") });
            continue;
          }
          if (step.status === "pending") {
            step.status = "verified";
            step.decidedAt = decidedAt;
            claim.history.push({
              id: idFactory("history"),
              kind: "verified",
              actorId,
              detail: trimmedComment || "Finance verification complete",
              createdAt: decidedAt,
            });
            claim.version += 1;
          } else {
            applyPayment(claim, step, actorId, decidedAt);
          }
        } else {
          const index = claim.steps.findIndex((step) => step.status === "pending");
          if (index === -1 || isTerminalIndex(claim, index)) {
            skipped.push({ claimId, reason: "not-in-approval", message: bulkApproveSkipMessage("not-in-approval") });
            continue;
          }
          const requester = requesterById.get(claim.requesterId);
          if (!requester || !canActOnStep(requester, actor, claim.steps[index])) {
            skipped.push({ claimId, reason: "not-eligible", message: bulkApproveSkipMessage("not-eligible") });
            continue;
          }
          applyApproval(claim, index, actorId, decidedAt, trimmedComment);
          await catchUpAbsentStages(claim, employees, timeoutDays, now, idFactory);
        }

        try {
          await store.updateClaim(claim);
        } catch (error) {
          // Another writer got there first (optimistic concurrency version check):
          // skip like any other ineligible row instead of aborting the run.
          if (isExpenseError(error) && error.code === "conflict") {
            skipped.push({ claimId, reason: "conflict", message: bulkApproveSkipMessage("conflict") });
            continue;
          }
          throw error;
        }
        approved.push(claim);
      }
      return { approved, skipped };
    },

    async listApprovalsQueue(actorId) {
      const actor = await requireEmployee(actorId);
      const caps = resolveRoleCapabilities(actor.role);
      if (!caps.canApprove && !caps.canAccessFinance) {
        throw new ExpenseError("unauthorized", "Only approvers can access the approvals inbox.");
      }
      const [employees, rawClaims] = await Promise.all([
        store.listEmployees(actor.organizationId),
        store.listClaimsForOrganization(actor.organizationId),
      ]);
      const claims = await catchUpAll(rawClaims, actor.organizationId);
      const requesterById = new Map(employees.map((candidate) => [candidate.id, candidate]));
      const approvable = claims.filter((claim) => {
        if (claim.requesterId === actor.id) return false;
        if (claim.status === "in-approval") {
          const index = claim.steps.findIndex((step) => step.status === "pending");
          if (index === -1 || isTerminalIndex(claim, index)) return false;
          const step = claim.steps[index];
          const requester = requesterById.get(claim.requesterId);
          if (!requester) return false;
          return canActOnStep(requester, actor, step);
        }
        if (claim.status === "in-finance") {
          const terminal = claim.steps[claim.steps.length - 1];
          if (!terminal || !actor.role) return false;
          return (
            (terminal.status === "pending" || terminal.status === "verified") &&
            terminal.roleId === actor.role.id
          );
        }
        return false;
      });
      return approvable.map((claim) => maskClaimComments(claim, actor));
    },

    async rejectClaim(actorId, claimId, reason) {
      const claim = await requireAssignedClaim(actorId, claimId);
      const index = claim.steps.findIndex((step) => step.status === "pending");
      if (index === -1 || (claim.status !== "in-approval" && claim.status !== "in-finance")) {
        throw new ExpenseError("conflict", "This claim is not waiting for an approval decision.");
      }
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        throw new ExpenseError("validation", "A reason is required to reject a claim.");
      }
      const step = claim.steps[index];
      const decidedAt = now().toISOString();
      step.status = "rejected";
      step.decidedAt = decidedAt;
      claim.history.push({ id: idFactory("history"), kind: "rejected", actorId, detail: trimmedReason, createdAt: decidedAt });
      // Rejection is outright and terminal at any stage: there is no
      // send-back-for-correction cycle. The employee may submit a brand new
      // claim for the same expense, but this claim is never edited or
      // resubmitted.
      claim.status = "rejected";
      claim.currentStage = undefined;
      claim.currentActorId = undefined;
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async delegateClaim(actorId, claimId, delegateeId, reason) {
      const actor = await requireEmployee(actorId);
      // Delegation is a Superadmin-only built-in (ADR-0015/0017): the
      // administrator re-routes a claim but never acts on it, and the
      // privilege is not a toggle.
      if (!actor.role || actor.role.code !== SUPERADMIN_ROLE_CODE) {
        throw new ExpenseError("unauthorized", "Only Superadmin can delegate a claim.");
      }
      const claimRow = await store.getClaim(claimId);
      if (!claimRow || claimRow.organizationId !== actor.organizationId) {
        throw new ExpenseError("not-found", "Expense claim does not exist.");
      }
      const claim = await catchUp(claimRow);
      if (claim.status !== "in-approval" && claim.status !== "in-finance") {
        throw new ExpenseError("conflict", "Only an in-flight claim can be delegated.");
      }
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        throw new ExpenseError("validation", "A reason is required to delegate a claim.");
      }
      if (trimmedReason.length > MAX_REASON_CODE_LENGTH) {
        throw new ExpenseError("validation", "Reason is too long.");
      }
      const employees = await store.listEmployees(claim.organizationId);
      const delegatee = employees.find((candidate) => candidate.id === delegateeId);
      if (!delegatee || !delegatee.active) {
        throw new ExpenseError("validation", "Choose an active employee to delegate to.");
      }
      // The requester can never act on their own claim, and re-pointing the
      // task to the person already holding it is a no-op: both would strand
      // the claim, so both are refused before anything is written.
      if (delegatee.id === claim.requesterId) {
        throw new ExpenseError("unauthorized", "A claim cannot be delegated to its requester.");
      }
      if (delegatee.id === claim.currentActorId || delegatee.id === actorId) {
        throw new ExpenseError("validation", "Choose a different person to delegate to.");
      }
      const currentIndex = claim.steps.findIndex((step) => step.status === "pending");
      if (currentIndex === -1) {
        throw new ExpenseError("conflict", "This claim is not waiting for an approval decision.");
      }
      const decidedAt = now().toISOString();
      claim.history.push({
        id: idFactory("history"),
        kind: "delegated",
        actorId,
        detail: delegationDetail(delegatee, trimmedReason),
        createdAt: decidedAt,
      });
      // Positional delegation (ADR-0017): when the delegatee's role appears
      // at a later pending step, the intermediate pending steps are each
      // auto-skipped (one 'skipped' event per step, each naming the
      // delegation) and the claim lands at that step. The step must still
      // be pending - a later step auto-skipped by an amount guard is never
      // a delegation target, or the claim would strand on a decided stage.
      const delegateeRoleId = delegatee.role?.id ?? null;
      const targetIndex =
        delegateeRoleId === null
          ? -1
          : claim.steps.findIndex(
              (step, index) =>
                index > currentIndex && step.status === "pending" && step.roleId === delegateeRoleId,
            );
      // The delegated person must be able to decide the landed stage
      // (ADR-0017). A role step (a team-lead step has no role and accepts
      // any person, mirroring the sweep) whose delegatee's role holds no
      // action privilege can neither approve nor verify/pay, and the
      // absence sweep would skip their stage as privilege-less - re-pointing
      // to them strands the claim either way. Role-mismatched but
      // privileged people are honored: the delegated assignee acts on their
      // landed step regardless of role (canActOnStep).
      const landedIndex = targetIndex === -1 ? currentIndex : targetIndex;
      if (claim.steps[landedIndex].roleId !== null && !hasActionPrivilege(resolveRoleCapabilities(delegatee.role))) {
        throw new ExpenseError(
          "validation",
          "The target's role has no action privileges, so they cannot act on this claim's stage.",
        );
      }
      if (targetIndex === -1) {
        // Same-stage delegation: only the person changes, the flow keeps
        // its position.
        claim.steps[currentIndex].assignedActorId = delegatee.id;
      } else {
        // An intermediate step already skipped by the absence sweep's
        // amount guard (a guard-skipped step can sit between two pending
        // ones) is left untouched: it already carries its own decided
        // timestamp and 'skipped' history event, and re-stamping it here
        // would duplicate the audit trail for a step this delegation never
        // touched.
        for (let index = currentIndex; index < targetIndex; index += 1) {
          if (claim.steps[index].status !== "pending") continue;
          claim.steps[index].status = "skipped";
          claim.steps[index].decidedAt = decidedAt;
          claim.history.push({
            id: idFactory("history"),
            kind: "skipped",
            actorId,
            detail: delegationSkipDetail(delegatee),
            createdAt: decidedAt,
          });
        }
        claim.steps[targetIndex].assignedActorId = delegatee.id;
      }
      claim.currentStage = claim.steps[landedIndex].roleId ?? undefined;      claim.currentActorId = delegatee.id;
      // The new actor gets a fresh absence window: a long-stuck claim must
      // not be swept the moment it is re-pointed.
      claim.currentStageSince = decidedAt;
      claim.status = isTerminalIndex(claim, landedIndex) ? "in-finance" : "in-approval";
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async verifyClaim(actorId, claimId) {
      const { claim, step } = await requireTerminalPoolClaim(actorId, claimId);
      if (claim.status !== "in-finance" || step.status !== "pending") {
        throw new ExpenseError("conflict", "This claim is not waiting for Finance verification.");
      }
      const verifiedAt = now().toISOString();
      step.status = "verified";
      step.decidedAt = verifiedAt;
      claim.history.push({ id: idFactory("history"), kind: "verified", actorId, detail: "Finance verification complete", createdAt: verifiedAt });
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async markPaid(actorId, claimId) {
      const { claim, step } = await requireTerminalPoolClaim(actorId, claimId);
      if (claim.status !== "in-finance") {
        throw new ExpenseError("conflict", "This claim is not ready for payment.");
      }
      if (step.status !== "verified") throw new ExpenseError("conflict", "Verify the claim before marking payment.");
      applyPayment(claim, step, actorId, now().toISOString());
      await store.updateClaim(claim);
      return claim;
    },

    async markClaimsPaid(actorId, claimIds) {
      const actor = await requireEmployee(actorId);
      // Bulk payment rides the finance verify/pay privilege (ADR-0023): any
      // role whose record carries it may run a payment batch, mirroring the
      // register export and drag-back import gates.
      if (!canAccessFinance(actor)) {
        throw new ExpenseError("unauthorized", "Only Finance can pay claims.");
      }
      const paid: ExpenseClaim[] = [];
      const skipped: BulkPaySkippedClaim[] = [];
      // Duplicate ids in the batch are paid once: the report never lists a
      // claim twice, and a re-run of the same ids is idempotent.
      for (const claimId of Array.from(new Set(claimIds))) {
        const check = await terminalPoolCheck(actorId, claimId);
        if (!check.ok) {
          skipped.push({ claimId, reason: check.reason, message: bulkPaySkipMessage(check.reason) });
          continue;
        }
        const { claim, step } = check;
        if (claim.status !== "in-finance" || step.status !== "verified") {
          const reason: BulkPaySkipReason = claim.status === "paid" ? "already-paid" : "not-verified";
          skipped.push({ claimId, reason, message: bulkPaySkipMessage(reason) });
          continue;
        }
        applyPayment(claim, step, actorId, now().toISOString());
        try {
          await store.updateClaim(claim);
        } catch (error) {
          // Another writer got there first (the store's optimistic version
          // check): the claim was already advanced, so it is skipped like
          // any other ineligible row instead of aborting the run.
          if (isExpenseError(error) && error.code === "conflict") {
            skipped.push({ claimId, reason: "conflict", message: bulkPaySkipMessage("conflict") });
            continue;
          }
          throw error;
        }
        paid.push(claim);
      }
      return { paid, skipped };
    },

    async importPaymentRegister(actorId, data) {
      const employee = await requireEmployee(actorId);
      // Drag-back import rides the finance verify/pay privilege (ADR-0023),
      // like the register export it feeds.
      if (!canAccessFinance(employee)) {
        throw new ExpenseError("unauthorized", "Only Finance can import a payment register.");
      }
      // Parsing is server-side authority: the bytes are validated against
      // the register format contract before any id is matched.
      const parsed = parsePaymentRegisterData(data);
      if (!parsed.ok) {
        throw new ExpenseError("validation", parsed.message);
      }
      const claims = await catchUpAll(
        await store.listClaimsForOrganization(employee.organizationId),
        employee.organizationId,
      );
      const claimById = new Map(claims.map((claim) => [claim.id, claim]));
      const matched: ExpenseClaim[] = [];
      const conflicts: PaymentRegisterImportConflict[] = [];
      const unknownIds: string[] = [];
      for (const expenseId of parsed.expenseIds) {
        const claim = claimById.get(expenseId);
        if (!claim) {
          unknownIds.push(expenseId);
          continue;
        }
        if (isVerifiedClaim(claim)) {
          matched.push(claim);
          continue;
        }
        conflicts.push({ claim, reason: claim.status === "paid" ? "already-paid" : "not-verified" });
      }
      return { matched, conflicts, unknownIds };
    },

    async listFinancePaymentQueue(actorId) {
      const employee = await requireEmployee(actorId);
      if (!canAccessFinance(employee)) {
        throw new ExpenseError("unauthorized", "Only Finance can view the payment queue.");
      }
      const claims = await catchUpAll(await store.listClaimsForOrganization(employee.organizationId), employee.organizationId);
      // Verified is the only waiting state (ADR-0023): the queue renders
      // only verified claims. Rejected, paid, draft, and not-yet-verified
      // rows are visible in the org-wide finance list instead.
      return claims.filter(isVerifiedClaim);
    },

    async listFinanceApprovedBankDetails(actorId) {
      const employee = await requireEmployee(actorId);
      if (!canAccessFinance(employee)) {
        throw new ExpenseError("unauthorized", "Only Finance can view the payment queue.");
      }
      return store.listApprovedBankDetails(employee.organizationId);
    },

    async updateComments(actorId, claimId, comments) {
      const employee = await requireEmployee(actorId);
      if (!canAccessFinance(employee)) {
        throw new ExpenseError("unauthorized", "Only Finance can add comments.");
      }
      const claim = await store.getClaim(claimId);
      if (!claim || claim.organizationId !== employee.organizationId) {
        throw new ExpenseError("not-found", "Expense claim does not exist.");
      }
      if (claim.status === "rejected") {
        throw new ExpenseError("conflict", "A rejected claim is terminal and cannot be commented on.");
      }
      const trimmed = comments.trim();
      if (trimmed !== (claim.comments ?? "")) {
        claim.history.push({ id: idFactory("history"), kind: "comment", actorId, detail: trimmed, createdAt: now().toISOString() });
      }
      claim.comments = trimmed;
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async listActivity(actorId, targetEmployeeId) {
      const actor = await requireEmployee(actorId);
      const target = targetEmployeeId ?? actorId;
      if (target !== actorId && !canAccessFinance(actor)) {
        throw new ExpenseError("unauthorized", "Only Finance can view another employee's activity.");
      }
      return store.listActivityForActor(actor.organizationId, target, ACTIVITY_EVENT_KINDS);
    },

    async listOrganizationActivity(actorId) {
      const actor = await requireEmployee(actorId);
      if (!canViewOrganizationActivity(actor)) {
        throw new ExpenseError("unauthorized", "Only Finance Head can view the organization activity feed.");
      }
      return store.listActivityForOrganization(actor.organizationId, [
        "submitted",
        "approved",
        "rejected",
        "verified",
        "paid",
        "delegated",
        "comment",
      ]);
    },

    async listOrganizationClaims(actorId) {
      const actor = await requireEmployee(actorId);
      if (!canViewOrganizationActivity(actor)) {
        throw new ExpenseError(
          "unauthorized",
          "Only roles with the view-org-wide-activity privilege can view the organization expense list.",
        );
      }
      return catchUpAll(
        await store.listClaimsForOrganization(actor.organizationId),
        actor.organizationId,
      );
    },

    // The sweep enforces the configured absence timeout even when nobody
    // opens the app (ADR-0018). Each claim passes through the same shared
    // catch-up as the lazy read path, so the two enforcement paths cannot
    // drift. Concurrent runs are safe: the store's optimistic version check
    // lets exactly one writer persist a claim, and a claim already advanced
    // by another pass is a conflict, not a double skip. A conflicting write
    // is treated as "someone else got there first" and skipped, so one
    // worker crashing over a race can never abort a pass.
    async sweepAbsentClaims(organizationId) {
      const [claims, employees, absenceTimeoutDays] = await Promise.all([
        store.listClaimsForOrganization(organizationId),
        store.listEmployees(organizationId),
        absenceTimeoutDaysFor(organizationId),
      ]);
      const advanced: ExpenseClaim[] = [];
      for (const claim of claims) {
        if (!catchUpAbsentStages(claim, employees, absenceTimeoutDays, now, idFactory)) continue;
        claim.version += 1;
        try {
          await store.updateClaim(claim);
        } catch (error) {
          if (isExpenseError(error) && error.code === "conflict") continue;
          throw error;
        }
        advanced.push(claim);
      }
      return advanced;
    },
  };
}

function validateDraft(input: CreateExpenseDraftInput): void {
  if (!input.title.trim()) throw new ExpenseError("validation", "Add a title for the expense.");
  if (!input.category.trim()) throw new ExpenseError("validation", "Choose a category.");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new ExpenseError("validation", "Enter an amount greater than ₹0.");
  }
  if (input.currency !== "INR") throw new ExpenseError("validation", "Expenses must be submitted in INR.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) {
    throw new ExpenseError("validation", "Choose a valid expense date.");
  }
}
