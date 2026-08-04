"use client";
// PROTOTYPE VARIANT B — "Bento split": a denser recent-claims list (left,
// wider) plus a compact "needs your attention" card (right) built only from
// data already on the expense — no new approver-inbox logic, no filters at
// all on the list side.

import { useMemo } from "react";
import { ArrowUpRight, AlertTriangle, Clock3 } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/ui/button";
import { STATUS_META, type Expense } from "../mock-data";
import { formatMoney, statusBadgeClass } from "../journey-meta";

const RECENT_COUNT = 5;

export function VariantBBento({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  const recent = useMemo(
    () =>
      [...expenses]
        .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0))
        .slice(0, RECENT_COUNT),
    [expenses],
  );

  const pending = useMemo(
    () => expenses.filter((e) => e.status === "submitted" || e.status === "in-approval"),
    [expenses],
  );
  const needsCorrection = useMemo(
    () => expenses.filter((e) => e.status === "needs-correction"),
    [expenses],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <section aria-label="Recent expenses" className="rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent expenses</h2>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href="/expenses/all">
              See all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </header>
        <ul className="divide-y divide-border">
          {recent.map((expense) => (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => onOpen(expense)}
                className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                <div className="flex shrink-0 items-center gap-2.5">
                  <AnimatedBadge
                    status={STATUS_META[expense.status].tone}
                    size="sm"
                    className={statusBadgeClass(expense.status)}
                  >
                    {STATUS_META[expense.status].label}
                  </AnimatedBadge>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums font-medium text-foreground">
                    {formatMoney(expense.amount, expense.currency)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-label="Needs your attention"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Needs your attention</h2>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Clock3 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{pending.length} pending approval</p>
            <p className="text-xs text-muted-foreground">
              {pending[0] ? `Most recent: ${pending[0].title}` : "Nothing waiting on someone else"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              {needsCorrection.length} need{needsCorrection.length === 1 ? "s" : ""} correction
            </p>
            <p className="text-xs text-muted-foreground">
              {needsCorrection[0] ? `Fix: ${needsCorrection[0].title}` : "Nothing sent back to you"}
            </p>
          </div>
        </div>

        {needsCorrection[0] ? (
          <Button size="sm" className="mt-1" onClick={() => onOpen(needsCorrection[0])}>
            Fix now
          </Button>
        ) : null}
      </section>
    </div>
  );
}
