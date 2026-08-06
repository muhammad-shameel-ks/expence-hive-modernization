import { FINANCE_HEAD_ROLE_CODE, MANAGER_ROLE_CODE, resolveRoleCapabilities } from "../shared/authorization";
import {
  ACTIVITY_EVENT_KINDS,
  type ActivityEntry,
  type CreateExpenseDraftInput,
  type ExpenseClaim,
  type ExpenseEmployee,
  type ExpenseStore,
  type FlowStepTarget,
} from "./ports";

const ABSENCE_TIMEOUT_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_REASON_CODE_LENGTH = 200;

function canAccessFinance(employee: ExpenseEmployee): boolean {
  return employee.role !== null && resolveRoleCapabilities(employee.role.code).canAccessFinance;
}

function canViewOrganizationActivity(employee: ExpenseEmployee): boolean {
  return (
    employee.role !== null && resolveRoleCapabilities(employee.role.code).canViewOrganizationActivity
  );
}

function canSeePayoutDetails(claim: ExpenseClaim, viewer: ExpenseEmployee): boolean {
  if (claim.requesterId === viewer.id) return true;
  return canAccessFinance(viewer);
}

function maskPayoutDetails(claim: ExpenseClaim, viewer: ExpenseEmployee): ExpenseClaim {
  if (canSeePayoutDetails(claim, viewer)) return claim;
  const masked = { ...claim };
  delete masked.payoutDetails;
  delete masked.comments;
  return masked;
}

function terminalIndex(claim: ExpenseClaim): number {
  return claim.steps.length - 1;
}

function isTerminalIndex(claim: ExpenseClaim, index: number): boolean {
  return index === terminalIndex(claim);
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

function stepLabel(step: ExpenseClaim["steps"][number]): string {
  return step.roleId === null ? "team lead" : step.roleId;
}

// A pool-stage label for the takeover history detail: team-lead steps are
// recorded by their named target kind, role steps by their role id.
function skippedStepLabels(claim: ExpenseClaim, start: number, end: number): string[] {
  const labels: string[] = [];
  for (let index = start; index < end; index += 1) {
    labels.push(stepLabel(claim.steps[index]));
  }
  return labels;
}

function activeIds(employees: ExpenseEmployee[]): string[] {
  return employees.filter((employee) => employee.active).map((employee) => employee.id);
}

// The takeover history detail names the skipped stages: team-lead steps are
// recorded under their "team lead" label (they have no role id), role steps
// under their role id.
function takeoverDetail(
  actor: ExpenseEmployee,
  reason: string,
  skippedLabels: string[],
): string {
  const skipped = skippedLabels.length > 0 ? `: ${skippedLabels.join(", ")}` : "";
  return `Took over as ${actor.role!.displayName} (reason: ${reason}); skipped ${skippedLabels.length} earlier stage(s)${skipped}`;
}

export type ExpenseErrorCode = "unauthorized" | "validation" | "not-found" | "conflict";

export class ExpenseError extends Error {
  constructor(readonly code: ExpenseErrorCode, message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

export function isExpenseError(error: unknown): error is ExpenseError {
  return error instanceof ExpenseError;
}

type IdFactory = (prefix: string) => string;

export type ExpenseCommands = {
  createDraft(actorId: string, input: CreateExpenseDraftInput): Promise<ExpenseClaim>;
  getClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  listClaims(actorId: string): Promise<ExpenseClaim[]>;
  getWorkspace(actorId: string): Promise<{ employee: ExpenseEmployee; employees: ExpenseEmployee[]; claims: ExpenseClaim[] }>;
  listEmployees(actorId: string): Promise<ExpenseEmployee[]>;
  submitClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  approveStage(actorId: string, claimId: string): Promise<ExpenseClaim>;
  rejectClaim(actorId: string, claimId: string, reason: string): Promise<ExpenseClaim>;
  takeOverClaim(actorId: string, claimId: string, reasonCode: string): Promise<ExpenseClaim>;
  verifyClaim(actorId: string, claimId: string): Promise<ExpenseClaim>;
  markPaid(actorId: string, claimId: string): Promise<ExpenseClaim>;
  listFinancePaymentQueue(actorId: string): Promise<ExpenseClaim[]>;
  updateComments(actorId: string, claimId: string, comments: string): Promise<ExpenseClaim>;
  listActivity(actorId: string, targetEmployeeId?: string): Promise<ActivityEntry[]>;
  listOrganizationActivity(actorId: string): Promise<ActivityEntry[]>;
};

export function createExpenseCommands({
  store,
  now = () => new Date(),
  idFactory = (prefix) => `${prefix}-${crypto.randomUUID()}`,
}: {
  store: ExpenseStore;
  now?: () => Date;
  idFactory?: IdFactory;
}): ExpenseCommands {
  async function requireEmployee(actorId: string): Promise<ExpenseEmployee> {
    const employee = await store.getEmployee(actorId);
    if (!employee || !employee.active) {
      throw new ExpenseError("unauthorized", "The current user is not an active employee.");
    }
    return employee;
  }

  // A pending stage is absent when its role is vacant (no assigned actor,
  // or the assigned actor is not an active employee) or the assigned actor
  // has not decided within 3 days of the stage becoming current. Either
  // condition auto-skips the stage to the next one. The terminal stage is
  // never auto-skipped: there is nowhere to advance it to, and payment
  // completion must not be silently bypassed.
  function catchUpAbsentStages(claim: ExpenseClaim, activeEmployeeIds: Set<string>): boolean {
    if (claim.status !== "in-approval" && claim.status !== "in-finance") return false;
    let changed = false;
    for (;;) {
      const index = claim.steps.findIndex((step) => step.status === "pending");
      if (index === -1 || isTerminalIndex(claim, index)) break;
      const step = claim.steps[index];
      const vacant = !step.assignedActorId || !activeEmployeeIds.has(step.assignedActorId);
      const since = claim.currentStageSince ?? claim.submittedAt ?? claim.createdAt;
      const timedOut = now().getTime() - new Date(since).getTime() >= ABSENCE_TIMEOUT_MS;
      if (!vacant && !timedOut) break;
      const decidedAt = now().toISOString();
      step.status = "skipped";
      step.decidedAt = decidedAt;
      claim.history.push({
        id: idFactory("history"),
        kind: "skipped",
        detail: vacant
          ? "Skipped: no active employee holds this stage"
          : "Skipped: no response within 3 days",
        createdAt: decidedAt,
      });
      const next = claim.steps[index + 1];
      claim.currentStage = next.roleId ?? undefined;
      claim.currentActorId = next.assignedActorId;
      claim.currentStageSince = decidedAt;
      claim.status = isTerminalIndex(claim, index + 1) ? "in-finance" : "in-approval";
      changed = true;
    }
    return changed;
  }

  async function catchUp(claim: ExpenseClaim): Promise<ExpenseClaim> {
    const employees = await store.listEmployees(claim.organizationId);
    if (catchUpAbsentStages(claim, new Set(activeIds(employees)))) {
      claim.version += 1;
      await store.updateClaim(claim);
    }
    return claim;
  }

  async function catchUpAll(claims: ExpenseClaim[], organizationId: string): Promise<ExpenseClaim[]> {
    if (claims.length === 0) return claims;
    const employees = await store.listEmployees(organizationId);
    const employeeIds = new Set(activeIds(employees));
    for (const claim of claims) {
      if (catchUpAbsentStages(claim, employeeIds)) {
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

  async function requireAssignedClaim(actorId: string, claimId: string): Promise<ExpenseClaim> {
    const actor = await requireEmployee(actorId);
    const claimRow = await store.getClaim(claimId);
    if (!claimRow || claimRow.organizationId !== actor.organizationId) {
      throw new ExpenseError("not-found", "Expense claim does not exist.");
    }
    const claim = await catchUp(claimRow);
    if (claim.requesterId === actorId) {
      throw new ExpenseError("unauthorized", "You cannot approve your own expense claim.");
    }
    if (claim.currentActorId !== actorId) {
      throw new ExpenseError("unauthorized", "This expense claim is not assigned to you.");
    }
    return claim;
  }

  return {
    async createDraft(actorId, input) {
      const employee = await requireEmployee(actorId);
      validateDraft(input);
      const createdAt = now().toISOString();
      const claimId = idFactory("claim");
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
        attachment: input.attachment
          ? { ...input.attachment, id: idFactory("attachment"), status: "available" }
          : undefined,
        payoutDetails: input.payoutDetails ? { ...input.payoutDetails } : undefined,
        steps: [],
        history: [{ id: idFactory("history"), kind: "draft", actorId, createdAt }],
        version: 1,
        createdAt,
      };
      await store.createClaim(claim);
      return claim;
    },

    async getClaim(actorId, claimId) {
      const employee = await requireEmployee(actorId);
      const claim = await requireViewableClaim(actorId, claimId);
      return maskPayoutDetails(claim, employee);
    },

    async listClaims(actorId) {
      const employee = await requireEmployee(actorId);
      const claims = await catchUpAll(await store.listClaimsForEmployee(employee), employee.organizationId);
      return claims.map((claim) => maskPayoutDetails(claim, employee));
    },

    async getWorkspace(actorId) {
      const employee = await requireEmployee(actorId);
      const [employees, rawClaims] = await Promise.all([
        store.listEmployees(employee.organizationId),
        store.listClaimsForEmployee(employee),
      ]);
      const claims = await catchUpAll(rawClaims, employee.organizationId);
      return { employee, employees, claims: claims.map((claim) => maskPayoutDetails(claim, employee)) };
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
      const flow = await store.getPublishedFlowForRole(requester.organizationId, requester.role.id);
      if (!flow || flow.steps.length === 0) {
        throw new ExpenseError("validation", "No approval flow is published for your role yet.");
      }
      const employees = await store.listEmployees(requester.organizationId);
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
      claim.status = "in-approval";
      claim.currentStage = claim.steps[0].roleId ?? undefined;
      claim.currentActorId = claim.steps[0].assignedActorId;
      claim.currentStageSince = submittedAt;
      claim.submittedAt = submittedAt;
      claim.version += 1;
      claim.history.push({ id: idFactory("history"), kind: "submitted", actorId, createdAt: submittedAt });
      catchUpAbsentStages(claim, new Set(activeIds(employees)));
      await store.updateClaim(claim);
      return claim;
    },

    async approveStage(actorId, claimId) {
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
      // Pool semantics (stories 13/14): any eligible pool member may approve
      // the current stage, not only the member it was assigned to. The
      // assignment is the default actor; the pool is the authority.
      const requester = (await store.listEmployees(claim.organizationId)).find(
        (candidate) => candidate.id === claim.requesterId,
      );
      if (!requester || !isEligible(requester, actor, stepTarget(claim.steps[index]))) {
        throw new ExpenseError("unauthorized", "You are not eligible to approve this claim's current stage.");
      }
      const step = claim.steps[index];
      const decidedAt = now().toISOString();
      step.status = "approved";
      step.decidedAt = decidedAt;
      claim.history.push({ id: idFactory("history"), kind: "approved", actorId, createdAt: decidedAt });
      const next = claim.steps[index + 1];
      claim.currentStage = next.roleId ?? undefined;
      claim.currentActorId = next.assignedActorId;
      claim.currentStageSince = decidedAt;
      claim.status = isTerminalIndex(claim, index + 1) ? "in-finance" : "in-approval";
      claim.version += 1;
      const employees = await store.listEmployees(claim.organizationId);
      catchUpAbsentStages(claim, new Set(activeIds(employees)));
      await store.updateClaim(claim);
      return claim;
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

    async takeOverClaim(actorId, claimId, reasonCode) {
      const actor = await requireEmployee(actorId);
      const claimRow = await store.getClaim(claimId);
      if (!claimRow || claimRow.organizationId !== actor.organizationId) {
        throw new ExpenseError("not-found", "Expense claim does not exist.");
      }
      const claim = await catchUp(claimRow);
      if (claim.requesterId === actorId) {
        throw new ExpenseError("unauthorized", "You cannot take over your own expense claim.");
      }
      if (claim.status !== "in-approval" && claim.status !== "in-finance") {
        throw new ExpenseError("conflict", "This claim is not waiting for an approval decision.");
      }
      // Validated as free text, not against an admin-managed reason-code
      // catalog (issue #29 calls for the latter): building that catalog is
      // out of scope for this pass and tracked as follow-up work.
      const reason = reasonCode.trim();
      if (!reason) {
        throw new ExpenseError("validation", "A reason code is required to take over a claim.");
      }
      if (reason.length > MAX_REASON_CODE_LENGTH) {
        throw new ExpenseError("validation", "Reason code is too long.");
      }
      if (!actor.role) {
        throw new ExpenseError("unauthorized", "You have no role that is eligible to take over this claim.");
      }
      const currentIndex = claim.steps.findIndex((step) => step.status === "pending");
      if (currentIndex === -1) {
        throw new ExpenseError("conflict", "This claim is not waiting for an approval decision.");
      }
      const employees = await store.listEmployees(claim.organizationId);
      const requester = employees.find((candidate) => candidate.id === claim.requesterId);
      // Positional takeover: a later step targeting the actor's own role.
      // Team-lead steps carry a null role id, so they can never be a
      // takeover target.
      const targetIndex = claim.steps.findIndex(
        (step, index) => index > currentIndex && step.roleId === actor.role!.id,
      );
      // Finance Head apex: when the actor holds Finance Head and no later
      // step targets their role, they take over by skipping every pending
      // stage up to the terminal stage and assigning the terminal stage to
      // the first eligible holder of its role (a Finance Executive) rather
      // than to themselves (story 19/20). The terminal stage itself is never
      // skipped by any takeover.
      const financeHeadApex = actor.role.code === FINANCE_HEAD_ROLE_CODE && targetIndex === -1;
      const decidedAt = now().toISOString();
      if (financeHeadApex) {
        const terminalStepIndex = terminalIndex(claim);
        const skippedLabels = skippedStepLabels(claim, currentIndex, terminalStepIndex);
        for (let index = currentIndex; index < terminalStepIndex; index += 1) {
          claim.steps[index].status = "skipped";
          claim.steps[index].decidedAt = decidedAt;
        }
        const terminalTarget = stepTarget(claim.steps[terminalStepIndex]);
        const eligible = requester
          ? employees.find((candidate) => isEligible(requester, candidate, terminalTarget))
          : undefined;
        claim.steps[terminalStepIndex].assignedActorId = eligible?.id;
        claim.history.push({
          id: idFactory("history"),
          kind: "takeover",
          actorId,
          detail: takeoverDetail(actor, reason, skippedLabels),
          createdAt: decidedAt,
        });
        claim.currentStage = claim.steps[terminalStepIndex].roleId ?? undefined;
        claim.currentActorId = eligible?.id;
        claim.currentStageSince = decidedAt;
        claim.status = "in-finance";
        claim.version += 1;
        await store.updateClaim(claim);
        return claim;
      }
      if (targetIndex === -1) {
        throw new ExpenseError("unauthorized", "You are not eligible to take over this claim.");
      }
      const skippedLabels = skippedStepLabels(claim, currentIndex, targetIndex);
      for (let index = currentIndex; index < targetIndex; index += 1) {
        claim.steps[index].status = "skipped";
        claim.steps[index].decidedAt = decidedAt;
      }
      claim.steps[targetIndex].assignedActorId = actorId;
      claim.history.push({
        id: idFactory("history"),
        kind: "takeover",
        actorId,
        detail: takeoverDetail(actor, reason, skippedLabels),
        createdAt: decidedAt,
      });
      claim.currentStage = claim.steps[targetIndex].roleId ?? undefined;
      claim.currentActorId = actorId;
      claim.currentStageSince = decidedAt;
      claim.status = isTerminalIndex(claim, targetIndex) ? "in-finance" : "in-approval";
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async verifyClaim(actorId, claimId) {
      const claim = await requireAssignedClaim(actorId, claimId);
      const index = terminalIndex(claim);
      if (claim.status !== "in-finance" || claim.steps[index]?.status !== "pending") {
        throw new ExpenseError("conflict", "This claim is not waiting for Finance verification.");
      }
      const step = claim.steps[index];
      const verifiedAt = now().toISOString();
      step.status = "verified";
      step.decidedAt = verifiedAt;
      claim.history.push({ id: idFactory("history"), kind: "verified", actorId, detail: "Finance verification complete", createdAt: verifiedAt });
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async markPaid(actorId, claimId) {
      const claim = await requireAssignedClaim(actorId, claimId);
      const index = terminalIndex(claim);
      if (claim.status !== "in-finance") {
        throw new ExpenseError("conflict", "This claim is not ready for payment.");
      }
      const step = claim.steps[index];
      if (!step || step.status !== "verified") throw new ExpenseError("conflict", "Verify the claim before marking payment.");
      const paidAt = now().toISOString();
      step.status = "paid";
      step.decidedAt = paidAt;
      claim.history.push({ id: idFactory("history"), kind: "paid", actorId, detail: "Payment marked complete", createdAt: paidAt });
      claim.status = "paid";
      claim.currentStage = undefined;
      claim.currentActorId = undefined;
      claim.version += 1;
      await store.updateClaim(claim);
      return claim;
    },

    async listFinancePaymentQueue(actorId) {
      const employee = await requireEmployee(actorId);
      if (!canAccessFinance(employee)) {
        throw new ExpenseError("unauthorized", "Only Finance can view the payment queue.");
      }
      const claims = await catchUpAll(await store.listClaimsForOrganization(employee.organizationId), employee.organizationId);
      return claims.filter((claim) => claim.status === "in-finance" || claim.status === "paid");
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
      return store.listActivityForOrganization(actor.organizationId, ACTIVITY_EVENT_KINDS);
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
  if (input.payoutDetails && (!input.payoutDetails.accountNumber?.trim() || !input.payoutDetails.ifscCode?.trim())) {
    throw new ExpenseError("validation", "Enter a valid account number and IFSC code.");
  }
}
