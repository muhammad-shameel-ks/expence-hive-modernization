"use client";
// The full searchable/filterable/sortable expense list, with its own drawer wiring.

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseDrawer } from "./expense-drawer";
import { ExpenseTable } from "./expense-table";
import type { Expense } from "./mock-data";

export function FullExpenseList({
  expenses,
  currentUser,
}: {
  expenses: Expense[];
  currentUser: string;
}) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  return (
    <section aria-label="All expenses" className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">All expenses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every claim from {currentUser.split(" ")[0]}, newest first.
          </p>
        </div>
        <Button className="gap-1.5" asChild>
          <a href="/expenses/new">
            <Plus className="h-4 w-4" />
            New expense
          </a>
        </Button>
      </header>
      <ExpenseTable
        expenses={expenses}
        currentUser={currentUser}
        onOpen={openExpense}
        searchable
        filterable
      />

      <ExpenseDrawer open={open} onOpenChange={setOpen} expense={selected} currentUser={currentUser} />
    </section>
  );
}
