import type { Expense } from "./mock-data";

export interface AttentionGroups {
  pending: Expense[];
}

/** Groups claims the current user should pay attention to right now. */
export function groupAttentionItems(expenses: Expense[]): AttentionGroups {
  return {
    pending: expenses.filter((e) => e.status === "submitted" || e.status === "in-approval"),
  };
}
