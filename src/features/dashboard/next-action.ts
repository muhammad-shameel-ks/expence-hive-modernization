import type { Expense, ExpenseStatus } from "./mock-data";

export interface NextAction {
  label: string;
  actor?: string;
  mine: boolean;
}

// Prefer comparing employee ids: display names can differ between where an
// expense's assigned actor is named (the expense directory) and where the
// current user's name comes from (e.g. a dev-login label like "Sanil Davis /
// Manager (IT)"), which would otherwise make "mine" silently false.
export function isCurrentActor(expense: Expense, me: string, meId?: string): boolean {
  if (meId && expense.nextActorId) return expense.nextActorId === meId;
  return !!expense.nextActor && expense.nextActor === me;
}

export function nextActionFor(expense: Expense, me = "", meId?: string): NextAction {
  switch (expense.status) {
    case "draft":
      return { label: "Continue draft", actor: me, mine: true };
    case "rejected":
      return { label: "Submit a new claim", mine: false };
    case "in-approval":
    case "submitted":
      return { label: expense.nextStage ?? "Approval", actor: expense.nextActor, mine: isCurrentActor(expense, me, meId) };
    case "approved":
    case "in-finance":
      return { label: "Finance verification", actor: expense.nextActor, mine: isCurrentActor(expense, me, meId) };
    case "paid":
      return { label: "Done", mine: false };
  }
}

export function isTerminal(status: ExpenseStatus) {
  return status === "paid" || status === "rejected";
}
