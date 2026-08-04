"use client";
// PROTOTYPE VARIANT C — "Status columns": horizontally-scrolling groups
// (Draft/In progress, Awaiting money, Done) each holding a couple of claim
// chips. No list/table at all — structurally the most different option.

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Expense, ExpenseStatus } from "../mock-data";
import { formatMoney } from "../journey-meta";

const COLUMNS: { title: string; statuses: ExpenseStatus[] }[] = [
  { title: "Draft & needs fixing", statuses: ["draft", "needs-correction"] },
  { title: "In progress", statuses: ["submitted", "in-approval", "approved", "in-finance"] },
  { title: "Done", statuses: ["paid", "rejected"] },
];

export function VariantCColumns({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  const grouped = useMemo(
    () =>
      COLUMNS.map((col) => ({
        ...col,
        items: expenses
          .filter((e) => col.statuses.includes(e.status))
          .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1)),
      })),
    [expenses],
  );

  return (
    <section aria-label="Expenses by status" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-center justify-between gap-3 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Expenses by status</h2>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/expenses/all">
            See all
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {grouped.map((col) => (
          <div key={col.title} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.title}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">{col.items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.items.slice(0, 3).map((expense) => (
                <button
                  key={expense.id}
                  type="button"
                  onClick={() => onOpen(expense)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40"
                >
                  <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatMoney(expense.amount, expense.currency)}
                  </p>
                </button>
              ))}
              {col.items.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">Nothing here.</p>
              ) : null}
              {col.items.length > 3 ? (
                <p className="px-1 text-xs text-muted-foreground">+{col.items.length - 3} more</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
