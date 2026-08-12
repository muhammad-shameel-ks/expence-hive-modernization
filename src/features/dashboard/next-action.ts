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

// Client-side mirror of the server's terminal-stage pool authorization
// (requireTerminalPoolClaim in commands.ts): any active holder of the
// terminal step's role can verify/pay a claim, not just the member it was
// assigned to (stories 13/14). Works on the claim shape shared by the
// dashboard read model and the finance payment queue. The server checks the
// terminal step (the claim's last one) unconditionally for verify/pay, so
// the mirror does the same. Manager steps are department-scoped on the
// server, but the terminal stage is always a finance role, so no department
// comparison is needed here. The requester can never verify or pay their
// own claim.
export function isTerminalPoolEligible(
  claim: { requesterId?: string; steps?: readonly { roleId: string | null; status: string }[] },
  meId?: string,
  viewerRoleId?: string,
): boolean {
  if (!meId || !viewerRoleId) return false;
  if (claim.requesterId === meId) return false;
  const steps = claim.steps ?? [];
  const terminal = steps[steps.length - 1];
  if (!terminal || terminal.roleId === null) return false;
  if (terminal.status !== "pending" && terminal.status !== "verified") return false;
  return terminal.roleId === viewerRoleId;
}

export function nextActionFor(
  expense: Expense,
  me = "",
  meId?: string,
  viewerRoleId?: string,
): NextAction {
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
      return {
        label: "Finance verification",
        actor: expense.nextActor,
        mine: isCurrentActor(expense, me, meId) || isTerminalPoolEligible(expense, meId, viewerRoleId),
      };
    case "paid":
      return { label: "Done", mine: false };
  }
}

export function isTerminal(status: ExpenseStatus) {
  return status === "paid" || status === "rejected";
}
