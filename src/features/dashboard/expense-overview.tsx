"use client";
// The dashboard's below-stats section: a compact recent-claims list (left,
// wider) plus a "needs your attention" card (right) grouping claims pending
// approval and sent back for correction. Every row opens the drawer.

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, AlertTriangle, ChevronDown, Clock3 } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { groupAttentionItems } from "./dashboard-attention";
import { STATUS_META, type Expense } from "./mock-data";
import { formatMoney, statusBadgeClass } from "./journey-meta";

const RECENT_COUNT = 5;

export function ExpenseOverview({
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

  const { pending, needsCorrection } = useMemo(() => groupAttentionItems(expenses), [expenses]);
  const attentionItems = useMemo(
    () =>
      [...needsCorrection, ...pending].sort((a, b) =>
        a.submittedAt < b.submittedAt ? 1 : a.submittedAt > b.submittedAt ? -1 : 0,
      ),
    [needsCorrection, pending],
  );

  const [viewAllOpen, setViewAllOpen] = useState(false);

  const openFromModal = (expense: Expense) => {
    setViewAllOpen(false);
    onOpen(expense);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
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
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Needs your attention</h2>
          {attentionItems.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setViewAllOpen(true)}>
              View all
            </Button>
          ) : null}
        </div>

        <AttentionGroup
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
          label="pending approval"
          emptyLabel="Nothing waiting on someone else"
          items={pending}
          onOpen={onOpen}
          defaultOpen={pending.length > 0 && needsCorrection.length === 0}
        />

        <AttentionGroup
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          label="need correction"
          singularLabel="needs correction"
          emptyLabel="Nothing sent back to you"
          items={needsCorrection}
          onOpen={onOpen}
          defaultOpen={needsCorrection.length > 0}
        />
      </section>

      <Dialog open={viewAllOpen} onOpenChange={setViewAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Needs your attention</DialogTitle>
            <DialogDescription>
              Everything pending approval or sent back to you, newest first.
            </DialogDescription>
          </DialogHeader>
          <ul className="-mx-2 max-h-[60vh] divide-y divide-border overflow-y-auto">
            {attentionItems.map((expense) => (
              <li key={expense.id}>
                <button
                  type="button"
                  onClick={() => openFromModal(expense)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{expense.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{expense.ref}</p>
                  </div>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttentionGroup({
  icon,
  iconClassName,
  label,
  singularLabel,
  emptyLabel,
  items,
  onOpen,
  defaultOpen,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  singularLabel?: string;
  emptyLabel: string;
  items: Expense[];
  onOpen: (expense: Expense) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasItems = items.length > 0;
  const countLabel = items.length === 1 && singularLabel ? singularLabel : label;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => hasItems && setOpen((v) => !v)}
        aria-expanded={hasItems ? open : undefined}
        disabled={!hasItems}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
          hasItems ? "hover:bg-muted/40" : "cursor-default opacity-70",
        )}
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", iconClassName)}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {items.length} {countLabel}
          </p>
          {!hasItems ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null}
        </div>
        {hasItems ? (
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        ) : null}
      </button>

      {hasItems && open ? (
        <ul className="divide-y divide-border border-t border-border">
          {items.map((expense) => (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => onOpen(expense)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <p className="truncate text-sm text-foreground">{expense.title}</p>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatMoney(expense.amount, expense.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
