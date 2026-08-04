"use client";
// The dashboard — "Timeline hero".
// Monthly overview cards, the current expense as a journey timeline hero,
// and the full expense table below. Row click opens the right drawer.

import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  Timeline,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineOppositeContent,
  TimelineSeparator,
} from "@/components/motion/timeline";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { currentExpense } from "./current-expense";
import { dashboardStats } from "./dashboard-stats";
import { ExpenseDrawer } from "./expense-drawer";
import { ExpenseTable } from "./expense-table";
import { expenses, STATUS_META, type Expense } from "./mock-data";
import { KIND_META, formatMoney, initials, statusBadgeClass } from "./journey-meta";
import { nextActionFor } from "./next-action";

const DASHBOARD_MONTH = expenses
  .reduce((latest, expense) => (expense.submittedAt > latest.submittedAt ? expense : latest))
  .submittedAt.slice(0, 7);

export function ExpenseDashboard({ currentUser }: { currentUser: string }) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  const hero = currentExpense(expenses);
  const heroNext = hero ? nextActionFor(hero, currentUser) : null;
  const stats = dashboardStats(expenses, DASHBOARD_MONTH);

  const statCards = [
    {
      label: "Spent this month",
      value: formatMoney(stats.spentThisMonth),
      hint: `${stats.spentThisMonthCount} ${stats.spentThisMonthCount === 1 ? "expense" : "expenses"}`,
    },
    { label: "Pending approval", value: String(stats.pendingApproval), hint: "awaiting a decision" },
    { label: "Needs correction", value: String(stats.needsCorrection), hint: "one is yours" },
    {
      label: "Reimbursed this month",
      value: formatMoney(stats.reimbursedThisMonth),
      hint: "payments received",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Monthly overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:p-5"
          >
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </section>

      {hero && heroNext ? (
        <section
          aria-label="Current expense"
          className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[1.35fr_0.65fr]"
        >
          <div className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Current expense
                </p>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {hero.title}
                </h2>
              </div>
              <AnimatedBadge status={STATUS_META[hero.status].tone} className={statusBadgeClass(hero.status)}>
                {STATUS_META[hero.status].label}
              </AnimatedBadge>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {formatMoney(hero.amount, hero.currency)}
              </span>{" "}
              · {hero.category} · submitted {hero.date}
            </p>

            <Timeline position="alternate" className="mt-8">
              {hero.history.map((event, i) => {
                const meta = KIND_META[event.kind];
                const Icon = meta.icon;
                const isCurrent = i === hero.history.length - 1;
                return (
                  <TimelineItem key={event.id}>
                    <TimelineOppositeContent>
                      <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        {event.date}
                      </span>
                    </TimelineOppositeContent>
                    <TimelineSeparator>
                      <TimelineDot tone={meta.tone} size="lg" current={isCurrent}>
                        <Icon />
                      </TimelineDot>
                    </TimelineSeparator>
                    <TimelineContent>
                      <p className={cn("font-medium", isCurrent ? "text-foreground" : "text-foreground/80")}>
                        {meta.label}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{event.actor}</p>
                      {event.detail ? (
                        <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                      ) : null}
                    </TimelineContent>
                  </TimelineItem>
                );
              })}
            </Timeline>
          </div>

          <div className="flex flex-col justify-between gap-6 p-6 sm:p-8">
            <div>
              <h3 className="text-sm font-semibold text-foreground">What happens next</h3>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-4">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                    {initials(heroNext.actor ?? "?")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {heroNext.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {heroNext.mine
                      ? "Waiting on you"
                      : `Owned by ${heroNext.actor}`}
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
                {hero.permission ? (
                  <li className="flex gap-2.5">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    Linked to pre-approval {hero.permission}
                  </li>
                ) : null}
                {hero.blockingReason ? (
                  <li className="flex gap-2.5">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {hero.blockingReason}
                  </li>
                ) : null}
                <li className="flex gap-2.5">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  {STATUS_META[hero.status].label} · {hero.nextStage ?? "no stage assigned"}
                </li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => openExpense(hero)} className="flex-1">
                Open expense
                <ArrowUpRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" asChild>
                <a href="#all-expenses">All expenses</a>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <section
        id="all-expenses"
        aria-label="All expenses"
        className="rounded-2xl border border-border bg-card shadow-sm"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">All expenses</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every claim from {currentUser.split(" ")[0]}, newest first.
            </p>
          </div>
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            New expense
          </Button>
        </header>
        <ExpenseTable
          expenses={expenses}
          currentUser={currentUser}
          onOpen={openExpense}
          searchable
          filterable
        />
      </section>

      <ExpenseDrawer open={open} onOpenChange={setOpen} expense={selected} />
    </div>
  );
}
