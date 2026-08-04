"use client";
// Compact glance at recent claims — no search, one status chip, drill in via "See all".

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_META, type Expense } from "./mock-data";
import { formatMoney, statusBadgeClass } from "./journey-meta";

const RECENT_COUNT = 6;
const NEEDS_ACTION_STATUSES = new Set<Expense["status"]>(["draft", "needs-correction"]);

export function RecentExpensesCard({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  const [onlyNeedsAction, setOnlyNeedsAction] = useState(false);

  const rows = useMemo(() => {
    const pool = onlyNeedsAction ? expenses.filter((e) => NEEDS_ACTION_STATUSES.has(e.status)) : expenses;
    return [...pool]
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0))
      .slice(0, RECENT_COUNT);
  }, [expenses, onlyNeedsAction]);

  return (
    <section aria-label="Recent expenses" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent expenses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Your latest claims, at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={onlyNeedsAction}
            onClick={() => setOnlyNeedsAction((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              onlyNeedsAction
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Needs action
          </button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href="/expenses/all">
              See all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </header>

      <ul className="divide-y divide-border">
        {rows.map((expense) => (
          <li key={expense.id}>
            <button
              type="button"
              onClick={() => onOpen(expense)}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{expense.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{expense.ref}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <AnimatedBadge
                  status={STATUS_META[expense.status].tone}
                  size="sm"
                  className={statusBadgeClass(expense.status)}
                >
                  {STATUS_META[expense.status].label}
                </AnimatedBadge>
                <span className="tabular-nums font-medium text-foreground">
                  {formatMoney(expense.amount, expense.currency)}
                </span>
              </div>
            </button>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-5 py-10 text-center text-sm text-muted-foreground">
            No expenses match.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
