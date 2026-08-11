"use client";
// The role-adaptive dashboard (ADR-0020): a period switch (month / year /
// overall, persisted in a cookie) recomputes everything below together, and
// the four-card grid adapts to the viewer's role - employee money cards,
// an approver action queue, or finance payout health. The bento row below
// (compact claims list and "needs your attention" card) and the drawer
// integration stay intact; row clicks open the drawer.

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  periodLabel,
  type DashboardCards,
  type DashboardPeriod,
} from "@/server/expenses/dashboard-read-models";
import { ExpenseDrawer } from "./expense-drawer";
import { claimToExpense } from "./expense-read-model";
import { ExpenseOverview } from "./expense-overview";
import { MyActivity } from "./my-activity";
import { PeriodSwitch } from "./period-switch";
import { approverStatCards, employeeStatCards, financeStatCards, type StatCard } from "./dashboard-stats";
import type { ActivityItem, Expense } from "./mock-data";

export function ExpenseDashboard({
  currentUser,
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
  currentUserCanHold,
  cards,
  absenceTimeoutDays,
  period,
  expenses,
  activity = [],
  focusClaim,
}: {
  currentUser: string;
  currentUserId?: string;
  currentUserRoleId?: string;
  currentUserRoleCode?: string;
  /** Whether the viewer's role carries the can_hold capability (ADR-0015/0016). */
  currentUserCanHold?: boolean;
  /** Server-computed role aggregates (dashboard-read-models.ts); its `view` discriminator picks the card set. */
  cards: DashboardCards;
  /** The organization's configured absence timeout, resolved through the settings seam (ADR-0018). */
  absenceTimeoutDays: number;
  /** The persisted period preference; the switch recomputes the whole dashboard. */
  period: DashboardPeriod;
  expenses: Expense[];
  activity?: ActivityItem[];
  /** A claim to open in the drawer on mount, e.g. from the admin held-claims view. */
  focusClaim?: Expense;
}) {
  const [selected, setSelected] = useState<Expense | null>(focusClaim ?? null);
  const [open, setOpen] = useState(Boolean(focusClaim));
  const [loadingClaimId, setLoadingClaimId] = useState<string | null>(null);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  // Activity entries can reference a claim that has moved past this user's
  // stage and is no longer in `expenses` (the workspace list). Fetch it on
  // demand instead of only being able to open claims still assigned to them.
  async function openActivityClaim(claimId: string) {
    const known = expenses.find((expense) => expense.id === claimId);
    if (known) {
      openExpense(known);
      return;
    }
    setLoadingClaimId(claimId);
    try {
      const response = await fetch(`/api/expenses/${claimId}`);
      if (response.ok) {
        const { claim, employees } = await response.json();
        if (claim && typeof claim === "object") {
          openExpense(claimToExpense(claim, employees ?? []));
        }
      }
    } finally {
      setLoadingClaimId(null);
    }
  }

  const label = periodLabel(period);

  // The card set is picked from the server-computed aggregates; the CTAs
  // drive real next actions - resume the newest draft, resume a hold, or
  // chase the most overdue aged claim - all through the drawer.
  let statCards: StatCard[];
  if (cards.view === "employee") {
    statCards = employeeStatCards(cards.employee, label, {
      onResumeDraft: () => {
        const draft = expenses.find((expense) => expense.status === "draft" && expense.requesterId === currentUserId);
        if (draft) openExpense(draft);
      },
    });
  } else if (cards.view === "approver") {
    statCards = approverStatCards(cards.approver, absenceTimeoutDays, {
      onResumeHold: () => {
        const id = cards.approver.holdClaimIds[0];
        if (id) void openActivityClaim(id);
      },
      onReviewAged: () => {
        const id = cards.approver.agedClaimIds[0];
        if (id) void openActivityClaim(id);
      },
    });
  } else {
    statCards = financeStatCards(cards.finance, label, absenceTimeoutDays, {
      onReviewAged: () => {
        const id = cards.finance.agedClaimIds[0];
        if (id) void openActivityClaim(id);
      },
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <PeriodSwitch period={period} />
      </div>

      <section
        aria-label={`${label} overview`}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      >
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm lg:p-5"
          >
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
              {stat.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>
            {stat.action ? (
              stat.action.href ? (
                <a
                  href={stat.action.href}
                  className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
                >
                  {stat.action.label}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={stat.action.onClick}
                  className="mt-2 self-start text-xs font-semibold text-primary hover:underline"
                >
                  {stat.action.label}
                </button>
              )
            ) : null}
          </div>
        ))}
      </section>

      <ExpenseOverview
        expenses={expenses}
        period={period}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        onOpen={openExpense}
      />

      <MyActivity items={activity} period={period} onOpen={openActivityClaim} loadingClaimId={loadingClaimId} />

      <ExpenseDrawer
        open={open}
        onOpenChange={setOpen}
        expense={selected}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        currentUserRoleCode={currentUserRoleCode}
        currentUserCanHold={currentUserCanHold}
      />
    </div>
  );
}
