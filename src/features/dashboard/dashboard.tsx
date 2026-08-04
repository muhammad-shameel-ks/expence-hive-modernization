"use client";
// The dashboard — monthly overview cards plus a compact glance at recent expenses.
// Row click opens the right drawer; the full searchable list lives at /expenses/all.
//
// PROTOTYPE: the section below the stat cards is currently switchable via
// ?variant= (A/B/C) — see src/features/dashboard/prototype/. Once a variant
// is chosen, fold it in here and delete the switcher + losing variants.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/dev/prototype-switcher";
import { dashboardStats } from "./dashboard-stats";
import { ExpenseDrawer } from "./expense-drawer";
import { VariantAList } from "./prototype/variant-a-list";
import { VariantBBento } from "./prototype/variant-b-bento";
import { VariantCColumns } from "./prototype/variant-c-columns";
import type { Expense } from "./mock-data";
import { formatMoney } from "./journey-meta";

const VARIANTS = [
  { key: "A", label: "Flat list" },
  { key: "B", label: "Bento split" },
  { key: "C", label: "Status columns" },
];

export function ExpenseDashboard({ currentUser, expenses }: { currentUser: string; expenses: Expense[] }) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  const stats = dashboardStats(expenses, new Date().toISOString().slice(0, 7));

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

      <Suspense fallback={<VariantAList expenses={expenses} onOpen={openExpense} />}>
        <BelowStatsVariant expenses={expenses} onOpen={openExpense} />
      </Suspense>

      <ExpenseDrawer open={open} onOpenChange={setOpen} expense={selected} currentUser={currentUser} />
    </div>
  );
}

function BelowStatsVariant({
  expenses,
  onOpen,
}: {
  expenses: Expense[];
  onOpen: (expense: Expense) => void;
}) {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";

  return (
    <>
      {variant === "B" ? (
        <VariantBBento expenses={expenses} onOpen={onOpen} />
      ) : variant === "C" ? (
        <VariantCColumns expenses={expenses} onOpen={onOpen} />
      ) : (
        <VariantAList expenses={expenses} onOpen={onOpen} />
      )}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
}
