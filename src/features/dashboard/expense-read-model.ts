import type { Expense } from "./mock-data";
import type { ExpenseClaim, ExpenseEmployee, ExpenseHistoryEvent, ExpenseStage } from "@/server/expenses/ports";

const STAGE_LABELS: Record<ExpenseStage, string> = {
  manager: "Manager approval",
  it: "IT review",
  ceo: "CEO approval",
  finance: "Finance verification",
};

const HISTORY_KINDS: Record<ExpenseHistoryEvent["kind"], Expense["history"][number]["kind"]> = {
  draft: "draft",
  submitted: "submitted",
  approved: "approved",
  correction: "correction",
  rejected: "rejected",
  verified: "verified",
  paid: "paid",
};

export function claimToExpense(claim: ExpenseClaim, employees: ExpenseEmployee[]): Expense {
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
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
    nextStage: claim.currentStage ? STAGE_LABELS[claim.currentStage] : undefined,
    nextActor: claim.currentActorId ? names.get(claim.currentActorId) : undefined,
    attachments: claim.attachment ? [claim.attachment.fileName] : [],
    history: claim.history.map((event) => ({
      id: event.id,
      date: formatHistoryDate(event.createdAt),
      actor: names.get(event.actorId) ?? "System",
      kind: HISTORY_KINDS[event.kind],
      detail: event.detail,
    })),
    primaryAction: actionFor(claim),
  };
}

function actionFor(claim: ExpenseClaim): Expense["primaryAction"] {
  if (claim.currentStage !== "finance") return claim.currentStage ? "approve" : undefined;
  const financeStep = claim.steps.find((step) => step.stage === "finance");
  if (financeStep?.status === "pending") return "verify";
  if (financeStep?.status === "verified") return "pay";
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
