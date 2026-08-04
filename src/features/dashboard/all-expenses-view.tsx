"use client";

import { useState } from "react";
import { Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseDrawer } from "./expense-drawer";
import { ExpenseTable } from "./expense-table";
import type { Expense } from "./mock-data";

export function AllExpensesView({
  currentUser,
  expenses,
}: {
  currentUser: string;
  expenses: Expense[];
}) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1 p-0 text-muted-foreground hover:text-foreground" asChild>
              <a href="/expenses">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </a>
            </Button>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            All Expenses Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete list view with full search, status filters, and sorting.
          </p>
        </div>

        <Button
          size="lg"
          className="h-11 rounded-xl bg-foreground px-5 font-extrabold text-background shadow-lg transition hover:bg-foreground/90 hover:shadow-xl gap-2"
          asChild
        >
          <a href="/expenses/new">
            <Plus className="h-5 w-5 stroke-[2.5]" />
            <span>New expense</span>
          </a>
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ExpenseTable
          expenses={expenses}
          currentUser={currentUser}
          onOpen={openExpense}
          searchable
          filterable
        />
      </section>

      <ExpenseDrawer open={open} onOpenChange={setOpen} expense={selected} currentUser={currentUser} />
    </div>
  );
}
