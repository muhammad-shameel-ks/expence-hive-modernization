import { ME, type Expense, type ExpenseStatus } from "./mock-data";

export interface NextAction {
  label: string;
  actor?: string;
  mine: boolean;
}

export function nextActionFor(expense: Expense, me = ME): NextAction {
  switch (expense.status) {
    case "draft":
      return { label: "Continue draft", actor: me, mine: true };
    case "needs-correction":
      return { label: "Resubmit", actor: me, mine: true };
    case "rejected":
      return { label: "Appeal", actor: me, mine: true };
    case "in-approval":
    case "submitted":
      return { label: expense.nextStage ?? "Approval", actor: expense.nextActor, mine: false };
    case "approved":
    case "in-finance":
      return { label: "Finance verification", actor: expense.nextActor, mine: false };
    case "paid":
      return { label: "Done", mine: false };
  }
}

export function isTerminal(status: ExpenseStatus) {
  return status === "paid" || status === "rejected";
}
