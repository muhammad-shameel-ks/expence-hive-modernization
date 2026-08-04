"use client";
// Searchable, filterable expense table for the dashboard.
// Row click opens the right drawer. Sortable by date and amount.

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight, Search } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATUS_META, type Expense } from "./mock-data";
import { nextActionFor } from "./next-action";
import { formatMoney, statusBadgeClass } from "./journey-meta";
import {
  filterAndSortExpenses,
  type ExpenseFilter,
  type ExpenseSortKey,
} from "./expense-query";

const FILTERS: ExpenseFilter[] = ["All", "Needs action", "In progress", "Paid"];

export function ExpenseTable({
  expenses,
  currentUser,
  onOpen,
  searchable = false,
  filterable = false,
}: {
  expenses: Expense[];
  currentUser: string;
  onOpen: (expense: Expense) => void;
  searchable?: boolean;
  filterable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExpenseFilter>("All");
  const [sort, setSort] = useState<{ key: ExpenseSortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const rows = useMemo(
    () => filterAndSortExpenses(expenses, { query, filter, sortKey: sort.key, sortDir: sort.dir }),
    [expenses, query, filter, sort],
  );

  const countFor = (f: ExpenseFilter) =>
    f === "All" ? expenses.length : filterAndSortExpenses(expenses, { filter: f }).length;

  const toggleSort = (key: ExpenseSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div>
      {(searchable || filterable) && (
        <div className="flex flex-wrap items-center gap-3 pb-4">
          {searchable && (
            <label className="relative block w-full max-w-xs">
              <span className="sr-only">Search expenses</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, ref, category…"
                className="h-9 w-full rounded-full border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </label>
          )}
          {filterable && (
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {f}
                  <span className="ml-1.5 tabular-nums opacity-70">{countFor(f)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-full min-w-56 pl-5">Expense</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead className="hidden sm:table-cell">
              <button
                type="button"
                onClick={() => toggleSort("date")}
                className="inline-flex items-center gap-1 font-medium uppercase hover:text-foreground"
              >
                Date
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="text-right">
              <button
                type="button"
                onClick={() => toggleSort("amount")}
                className="inline-flex items-center gap-1 font-medium uppercase hover:text-foreground"
              >
                Amount
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="hidden lg:table-cell">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Next action</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((expense) => {
            const status = STATUS_META[expense.status];
            const next = nextActionFor(expense, currentUser);
            return (
              <TableRow
                key={expense.id}
                tabIndex={0}
                onClick={() => onOpen(expense)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(expense);
                  }
                }}
                className="cursor-pointer outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 [&_td]:py-3"
              >
                <TableCell className="pl-5">
                  <p className="font-medium text-foreground">{expense.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{expense.ref}</p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {expense.category}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {expense.date}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums text-foreground">
                  {formatMoney(expense.amount, expense.currency)}
                </TableCell>
                <TableCell className="hidden max-w-[150px] whitespace-normal lg:table-cell">
                  <AnimatedBadge status={status.tone} size="sm" className={statusBadgeClass(expense.status)}>
                    {status.label}
                  </AnimatedBadge>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      next.mine ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {next.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{next.actor ?? "—"}</p>
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground">
                  <ChevronRight className="ml-auto h-4 w-4" />
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No expenses match your search.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
