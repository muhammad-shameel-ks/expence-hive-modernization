import type { Expense } from "./mock-data";
import type { ExpenseClaim, ExpenseEmployee, ExpenseHistoryEvent } from "@/server/expenses/ports";

const HISTORY_KINDS: Record<ExpenseHistoryEvent["kind"], Expense["history"][number]["kind"]> = {
  draft: "draft",
  submitted: "submitted",
  approved: "approved",
  correction: "correction",
  rejected: "rejected",
  verified: "verified",
  paid: "paid",
  skipped: "skipped",
  takeover: "takeover",
};

export function claimToExpense(claim: ExpenseClaim, employees: ExpenseEmployee[]): Expense {
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const roleNames = new Map(
    employees.filter((employee) => employee.role).map((employee) => [employee.role!.id, employee.role!.displayName]),
  );
  const submittedAt = claim.submittedAt ?? claim.createdAt;
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
    nextStage: claim.currentStage ? roleNames.get(claim.currentStage) ?? claim.currentStage : undefined,
    nextActor: claim.currentActorId ? names.get(claim.currentActorId) : undefined,
    paymentMethod: claim.paymentMethod,
    attachments: claim.attachment ? [claim.attachment.fileName] : [],
    history: claim.history.map((event) => ({
      id: event.id,
      date: formatHistoryDate(event.createdAt),
      actor: event.actorId ? names.get(event.actorId) ?? "System" : "System",
      kind: HISTORY_KINDS[event.kind],
      detail: event.detail,
    })),
    primaryAction: actionFor(claim),
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

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}
