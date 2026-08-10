import type { ActivityItem, Expense } from "./mock-data";
import type { ActivityEntry, ExpenseClaim, ExpenseEmployee, ExpenseHistoryEvent } from "@/server/expenses/ports";

const HISTORY_KINDS: Record<ExpenseHistoryEvent["kind"], Expense["history"][number]["kind"]> = {
  draft: "draft",
  submitted: "submitted",
  approved: "approved",
  rejected: "rejected",
  verified: "verified",
  paid: "paid",
  skipped: "skipped",
  "auto-skipped": "auto-skipped",
  takeover: "takeover",
  comment: "comment",
};

export function claimToExpense(claim: ExpenseClaim, employees: ExpenseEmployee[]): Expense {
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const roleNames = new Map(
    employees.filter((employee) => employee.role).map((employee) => [employee.role!.id, employee.role!.displayName]),
  );
  const submittedAt = claim.submittedAt ?? claim.createdAt;
  const rejection = claim.status === "rejected" ? lastRejection(claim) : undefined;
  // A team-lead stage has no role id: its current stage is null in the
  // claim, so surface the stage under its named-person label.
  const currentTeamLeadStage = claim.currentStage
    ? undefined
    : claim.steps.find((step) => step.status === "pending")?.roleId === null
      ? "Team lead"
      : undefined;
  return {
    id: claim.id,
    ref: claim.ref,
    title: claim.title,
    category: claim.category,
    amount: claim.amountMinor / 100,
    currency: claim.currency,
    date: formatDate(claim.expenseDate),
    submittedAt,
    status: claim.status,
    requesterId: claim.requesterId,
    nextStage: claim.currentStage
      ? roleNames.get(claim.currentStage) ?? claim.currentStage
      : currentTeamLeadStage,
    nextActor: claim.currentActorId ? names.get(claim.currentActorId) : undefined,
    nextActorId: claim.currentActorId,
    attachments: claim.attachment ? [claim.attachment.fileName] : [],
    // Legacy placeholder rows (empty digest) have no stored object behind the
    // name; the drawer must not offer a receipt link that would 404.
    attachmentAvailable: Boolean(claim.attachment?.contentSha256),
    history: claim.history.map((event) => ({
      id: event.id,
      date: formatHistoryDate(event.createdAt),
      actor: event.actorId ? names.get(event.actorId) ?? "System" : "System",
      actorId: event.actorId,
      kind: HISTORY_KINDS[event.kind],
      detail: event.detail,
    })),
    steps: claim.steps.map((step) => ({
      id: step.id,
      roleId: step.roleId,
      roleName:
        step.roleId === null
          ? "Team lead"
          : roleNames.get(step.roleId) ?? (step.roleId.startsWith("role-") ? step.roleId.replace(/^role-/, "").replace(/-/g, " ") : step.roleId),
      assignedActorId: step.assignedActorId,
      assignedActorName: step.assignedActorId ? names.get(step.assignedActorId) : undefined,
      status: step.status,
      skipReason: step.skipReason,
      decidedAt: step.decidedAt ? formatHistoryDate(step.decidedAt) : undefined,
    })),
    primaryAction: actionFor(claim),
    blockingReason: rejection?.detail,
  };
}

function lastRejection(claim: ExpenseClaim): ExpenseHistoryEvent | undefined {
  for (let index = claim.history.length - 1; index >= 0; index -= 1) {
    if (claim.history[index].kind === "rejected") return claim.history[index];
  }
  return undefined;
}

export function activityEntryToItem(entry: ActivityEntry): ActivityItem {
  return {
    id: entry.id,
    claimId: entry.claimId,
    claimRef: entry.claimRef,
    claimTitle: entry.claimTitle,
    claimCategory: entry.claimCategory,
    amount: entry.claimAmountMinor / 100,
    currency: entry.claimCurrency,
    requesterName: entry.requesterName,
    actorName: entry.actorName,
    kind: HISTORY_KINDS[entry.kind],
    detail: entry.detail,
    date: formatHistoryDate(entry.createdAt),
  };
}

function actionFor(claim: ExpenseClaim): Expense["primaryAction"] {
  const index = claim.steps.findIndex((step) => step.status === "pending" || step.status === "verified");
  if (index === -1) return undefined;
  const isTerminal = index === claim.steps.length - 1;
  if (!isTerminal) return "approve";
  const step = claim.steps[index];
  if (step.status === "pending") return "verify";
  if (step.status === "verified") return "pay";
  return undefined;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatHistoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
