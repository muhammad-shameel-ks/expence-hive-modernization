import type { Expense, ExpenseStatus } from "./mock-data";

export interface NextAction {
  label: string;
  actor?: string;
  mine: boolean;
}

export function nextActionFor(expense: Expense, me = ""): NextAction {
  switch (expense.status) {
    case "draft":
      return { label: "Continue draft", actor: me, mine: true };
    case "rejected":
    case "needs-correction":
      return { label: "Resubmit", actor: me, mine: true };
    case "in-approval":
    case "submitted":
      return { label: expense.nextStage ?? "Approval", actor: expense.nextActor, mine: expense.nextActor === me };
    case "approved":
    case "in-finance":
      return { label: "Finance verification", actor: expense.nextActor, mine: expense.nextActor === me };
    case "paid":
      return { label: "Done", mine: false };
  }
}

export function isTerminal(status: ExpenseStatus) {
  return status === "paid";
}
