import type { Expense } from "./mock-data";
import { isCurrentActor, isTerminal, isTerminalPoolEligible } from "./next-action";

export interface AttentionGroups {
  pending: Expense[];
}

/** Groups in-flight claims the current user can act on right now. */
export function groupAttentionItems(
  expenses: Expense[],
  me = "",
  meId?: string,
  viewerRoleId?: string,
): AttentionGroups {
  return {
    // A claim surfaces here when the current user can act on it: they are
    // the assigned actor for the current stage, or - for the terminal
    // finance stage, which is a pool - they hold the current step's role
    // (stories 13/14). Claims the user raised but that have moved on to
    // another approver or finance person are excluded, as are drafts,
    // rejected, and paid claims. A held claim is paused (ADR-0016):
    // nothing waits on anyone, so it never counts as awaiting attention.
    pending: expenses.filter(
      (e) =>
        !isTerminal(e.status) &&
        e.status !== "draft" &&
        !e.held &&
        (isCurrentActor(e, me, meId) || isTerminalPoolEligible(e, meId, viewerRoleId)),
    ),
  };
}
