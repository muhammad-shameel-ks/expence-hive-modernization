import type { ExpenseClaim, ExpenseHistoryEvent } from "./ports";

/**
 * The latest rejection event in the claim's history, if any.
 * Shared by the queue's comment column, the Excel export, and the summary
 * PDF so the "latest rejection wins" rule lives in exactly one place
 * (ADR-0009: the reason renders read-only from history, never from comments).
 */
export function latestRejectionFor(claim: ExpenseClaim): ExpenseHistoryEvent | undefined {
  for (let index = claim.history.length - 1; index >= 0; index -= 1) {
    if (claim.history[index].kind === "rejected") return claim.history[index];
  }
  return undefined;
}
