import type { Expense } from "./mock-data";
import { isCurrentActor, isTerminal } from "./next-action";

export interface AttentionGroups {
  pending: Expense[];
}

/** Groups in-flight claims assigned to the current user to act on. */
export function groupAttentionItems(expenses: Expense[], me = "", meId?: string): AttentionGroups {
  return {
    // A claim only surfaces here when the current user is the assigned actor
    // for the current stage, matching the drawer's "waiting on you" logic.
    // Claims the user raised but that have moved on to another approver or
    // finance person are excluded. Drafts, rejected, and paid claims never
    // need attention.
    pending: expenses.filter(
      (e) => !isTerminal(e.status) && e.status !== "draft" && isCurrentActor(e, me, meId),
    ),
  };
}
