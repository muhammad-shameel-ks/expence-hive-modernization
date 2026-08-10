"use client";
// The dashboard — monthly overview cards plus a bento row: a compact recent-
// claims list and a "needs your attention" card. Row click opens the drawer;
// the full searchable list lives at /expenses/all.

import { useState } from "react";
import { dashboardStats } from "./dashboard-stats";
import { ExpenseDrawer } from "./expense-drawer";
import { claimToExpense } from "./expense-read-model";
import { ExpenseOverview } from "./expense-overview";
import { MyActivity } from "./my-activity";
import type { ActivityItem, Expense } from "./mock-data";
import { formatMoney } from "./journey-meta";

export function ExpenseDashboard({
  currentUser,
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
  expenses,
  activity = [],
}: {
  currentUser: string;
  currentUserId?: string;
  currentUserRoleId?: string;
  currentUserRoleCode?: string;
  expenses: Expense[];
  activity?: ActivityItem[];
}) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
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

  // Money stats are the viewer's own spend; pool claims (claims the viewer's
  // role can verify in Finance) never count as money they spent.
  const stats = dashboardStats(expenses, new Date().toISOString().slice(0, 7), currentUserId);

  const statCards = [
    {
      label: "Spent this month",
      value: formatMoney(stats.spentThisMonth),
      hint: `${stats.spentThisMonthCount} ${stats.spentThisMonthCount === 1 ? "expense" : "expenses"}`,
    },
    { label: "Awaiting decision", value: String(stats.pendingApproval), hint: "awaiting a decision" },
    { label: "Rejected", value: String(stats.rejected), hint: "submit a new claim if still valid" },
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

      <ExpenseOverview
        expenses={expenses}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        onOpen={openExpense}
      />

      <MyActivity items={activity} onOpen={openActivityClaim} loadingClaimId={loadingClaimId} />

      <ExpenseDrawer
        open={open}
        onOpenChange={setOpen}
        expense={selected}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        currentUserRoleCode={currentUserRoleCode}
      />
    </div>
  );
}
