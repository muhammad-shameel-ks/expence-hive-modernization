"use client";
// The dashboard's "needs your attention" card: claims the current user can
// act on right now, with a "View all" dialog for the full list. The layout
// map (dashboard-layout.ts, ADR-0027) decides where this card sits and when
// it renders - it only appears when it has items, so it never shows as an
// empty panel.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Expense } from "./mock-data";
import { formatMoney } from "./journey-meta";

export function AttentionCard({
  items,
  onOpen,
}: {
  /** The claims needing the current user's decision, newest first. */
  items: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  return (
    <section
      aria-label="Needs your attention"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Needs your attention</h2>
        {items.length > 0 ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/expenses/approvals">View all</Link>
          </Button>
        ) : null}
      </div>

      <AttentionGroup
        icon={<Clock3 className="h-4 w-4" />}
        iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
        label="awaiting decision"
        emptyLabel="Nothing waiting on someone else"
        items={items}
        onOpen={onOpen}
        defaultOpen={items.length > 0}
      />
    </section>
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
