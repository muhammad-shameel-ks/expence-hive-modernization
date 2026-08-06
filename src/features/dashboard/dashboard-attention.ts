import type { Expense } from "./mock-data";

export interface AttentionGroups {
  pending: Expense[];
}

/** Groups claims the current user should pay attention to right now. */
export function groupAttentionItems(expenses: Expense[]): AttentionGroups {
  return {
    // Awaiting a decision covers approval stages and the finance
    // verification/payment stage, so a claim parked with a Finance
    // Executive still surfaces on the dashboard.
    pending: expenses.filter(
      (e) => e.status === "submitted" || e.status === "in-approval" || e.status === "in-finance",
    ),
  };
}
