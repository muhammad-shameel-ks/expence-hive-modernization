"use client";
// The dashboard's expense list surface: the viewer's own claims in the
// selected period, with the shared filter section (ADR-0021) layered on top.
// The "needs your attention" card is a separate surface (attention-card.tsx)
// that the layout map arranges per role (ADR-0027).

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { inPeriod, type DashboardPeriod } from "@/server/expenses/dashboard-read-models";
import { Button } from "@/components/ui/button";
import { ExpenseFilterSection } from "./expense-filter-section";
import type { Expense } from "./mock-data";
import { formatMoney } from "./journey-meta";
import { StatusBadge } from "./status-badge";

const RECENT_COUNT = 5;

export function ExpenseOverview({
  expenses,
  period,
  currentUserId,
  onOpen,
}: {
  expenses: Expense[];
  /** The dashboard's period switch (ADR-0020): the recent list is bucketed to the same period as the cards. */
  period: DashboardPeriod;
  currentUserId?: string;
  onOpen: (expense: Expense) => void;
}) {
  // "Your Expense" is claims this person raised, not claims routed to them
  // for a decision. The workspace list mixes both because approvers need
  // their assigned claims too, so this section filters back down to mine,
  // then to the selected period. The shared filter section (ADR-0021) layers
  // client-side chips/filters/sort on top of that server-side period bucket;
  // the period switch refreshes the route but the filter state survives in
  // the URL.
  const ownExpenses = useMemo(
    () =>
      (currentUserId ? expenses.filter((e) => e.requesterId === currentUserId) : expenses).filter(
        (e) => inPeriod(e.submittedAt, period, new Date()),
      ),
    [expenses, currentUserId, period],
  );

  return (
    <section aria-label="Your Expense" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Your Expense</h2>
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a href="/expenses/all">
            See all
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </header>
      <ExpenseFilterSection expenses={ownExpenses}>
        {({ rows, hasActiveFilters }) => (
          <ul className="divide-y divide-border">
            {rows.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                {ownExpenses.length === 0
                  ? period === "overall"
                    ? "No claims yet"
                    : "No claims in this period"
                  : "No claims match your filters"}
              </li>
            ) : (
              (hasActiveFilters ? rows : rows.slice(0, RECENT_COUNT)).map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(expense)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <StatusBadge status={expense.status} />
                      <span className="w-20 shrink-0 text-right text-sm tabular-nums font-medium text-foreground">
                        {formatMoney(expense.amount, expense.currency)}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </ExpenseFilterSection>
    </section>
  );
}
