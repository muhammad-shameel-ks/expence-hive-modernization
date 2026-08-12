import { absenceTimeoutMillis } from "../shared/absence-timeout";
import {
  ACTION_PRIVILEGES,
  resolveRoleCapabilities,
  type RoleCapabilities,
} from "../shared/authorization";
import type { ExpenseClaim, ExpenseEmployee } from "./ports";

export function terminalIndex(claim: ExpenseClaim): number {
  return claim.steps.length - 1;
}

export function isTerminalIndex(claim: ExpenseClaim, index: number): boolean {
  return index === terminalIndex(claim);
}

// The action privileges that let a role act on a pending stage: approving
// at an approval stage, or verifying/paying at the finance stage. A role
// holding neither cannot progress a claim, so its pending steps are swept
// forward like a vacant stage (ADR-0015). Derived from the shared catalog
// so adding a third action privilege is a single-edit change. The
// finance-head role of the default catalog approves its stage with
// can_access_finance alone, so the check accepts either privilege rather
// than requiring can_approve. Shared with the delegation validation so a
// delegated target without any action privilege is refused up front
// instead of stranding the claim.
export function hasActionPrivilege(capabilities: RoleCapabilities): boolean {
  return ACTION_PRIVILEGES.some((privilege) => capabilities[privilege]);
}

// The shared "has the current stage waited past the configured absence
// timeout" predicate: the sweep uses it to auto-skip, and the dashboard's
// aging card uses it to surface stuck claims, so the two cannot drift
// apart (ADR-0018/0020).
export function isStageTimedOut(
  claim: ExpenseClaim,
  absenceTimeoutDays: number,
  now: Date,
): boolean {
  const since = claim.currentStageSince ?? claim.submittedAt ?? claim.createdAt;
  return now.getTime() - new Date(since).getTime() >= absenceTimeoutMillis(absenceTimeoutDays);
}

// A pending stage is absent when its role is vacant (no assigned actor,
// or the assigned actor is not an active employee), or the assigned actor
// has not decided within the organization's configured absence timeout of
// the stage becoming current, or the assigned actor's role no longer holds
// an action privilege for the stage (a role-privilege removal mid-flight).
// Each condition auto-skips the stage to the next one. The terminal stage
// is never auto-skipped: there is nowhere to advance it to, and payment
// completion must not be silently bypassed.
// This is the single shared implementation of the absence auto-skip
// (ADR-0018): the lazy read-path catch-up in the expense commands and the
// scheduled sweep worker both call it, so the two enforcement paths cannot
// drift. A held claim is exempt (ADR-0016): the hold is an explicit human
// decision that outranks the timeout, so the sweep never advances a held
// claim - the lazy path and the worker inherit the exemption here.
export function catchUpAbsentStages(
  claim: ExpenseClaim,
  employees: ExpenseEmployee[],
  absenceTimeoutDays: number,
  now: () => Date,
  idFactory: (prefix: string) => string,
): boolean {
  if (claim.status !== "in-approval" && claim.status !== "in-finance") return false;
  if (claim.heldAt) return false;
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const activeEmployeeIds = new Set(
    employees.filter((employee) => employee.active).map((employee) => employee.id),
  );
  let changed = false;
  for (;;) {
    const index = claim.steps.findIndex((step) => step.status === "pending");
    if (index === -1) break;
    if (isTerminalIndex(claim, index)) {
      if (claim.status === "in-approval") {
        claim.status = "in-finance";
        changed = true;
      }
      break;
    }
    const step = claim.steps[index];
    const vacant = !step.assignedActorId || !activeEmployeeIds.has(step.assignedActorId);
    // The privilege check applies to role steps only: a team-lead step
    // targets the assigned named person, whose own role is irrelevant to
    // the stage (story 17). A role step whose actor's role holds neither
    // approve nor finance access can never progress the claim, so the
    // stage is treated as absent and swept forward (ADR-0015).
    const assigned = step.assignedActorId ? employeesById.get(step.assignedActorId) : undefined;
    const lacksPrivilege =
      step.roleId !== null && !hasActionPrivilege(resolveRoleCapabilities(assigned?.role));
    const timedOut = isStageTimedOut(claim, absenceTimeoutDays, now());
    if (!vacant && !lacksPrivilege && !timedOut) break;
    const decidedAt = now().toISOString();
    step.status = "skipped";
    step.decidedAt = decidedAt;
    claim.history.push({
      id: idFactory("history"),
      kind: "skipped",
      detail: vacant
        ? "Skipped: no active employee holds this stage"
        : lacksPrivilege
          ? "Skipped: the assigned role lacks the privilege to act on this stage"
          : `Skipped: no response within ${absenceTimeoutDays} days`,
      createdAt: decidedAt,
    });
    // Advance to the next pending step: steps between could have been
    // auto-skipped by an amount guard at submission and must be passed
    // over, never stranding the claim on an already-skipped stage.
    const nextIndex = claim.steps.findIndex(
      (candidate, candidateIndex) => candidateIndex > index && candidate.status === "pending",
    );
    const next = claim.steps[nextIndex];
    claim.currentStage = next.roleId ?? undefined;
    claim.currentActorId = next.assignedActorId;
    claim.currentStageSince = decidedAt;
    claim.status = isTerminalIndex(claim, nextIndex) ? "in-finance" : "in-approval";
    changed = true;
  }
  return changed;
}
