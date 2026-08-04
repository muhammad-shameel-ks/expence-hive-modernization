"use client";
// PROTOTYPE VARIANT A — "Flat list": full-width recent-claims list, one
// status chip, no second card. This is what's currently live in dashboard.tsx.

import { RecentExpensesCard } from "../recent-expenses-card";
import type { Expense } from "../mock-data";

export function VariantAList({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  return <RecentExpensesCard expenses={expenses} onOpen={onOpen} />;
}
