"use client";
// Searchable, filterable expense table for the dashboard.
// Row click opens the right drawer. Sortable by expense, category, status,
// date, and amount; filterable by status, category, amount range, and date range.
// The table is presentational: the shared ExpenseFilterSection (ADR-0021)
// owns the filter/sort state, the URL sync, and the filtered rows; this
// component only renders them and reports column-sort clicks back.

import { ArrowUpDown, ChevronRight } from "lucide-react";
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
import { formatMoney, HELD_META, statusBadgeClass } from "./journey-meta";
import type { ExpenseSortKey } from "./expense-query";

const SORT_COLUMNS: { key: ExpenseSortKey; label: string; className: string }[] = [
  { key: "title", label: "Expense", className: "pl-5" },
  { key: "category", label: "Category", className: "hidden md:table-cell" },
  { key: "date", label: "Date", className: "hidden sm:table-cell" },
  { key: "amount", label: "Amount", className: "text-right" },
  { key: "status", label: "Status", className: "hidden lg:table-cell" },
];

export function ExpenseTable({
  rows,
  sort,
  onSort,
  currentUser,
  currentUserId,
  onOpen,
}: {
  /** The already-filtered, already-sorted rows from the shared filter section. */
  rows: Expense[];
  /** The current column sort, owned by the shared filter section. */
  sort: { key: ExpenseSortKey; dir: 1 | -1 };
  onSort: (key: ExpenseSortKey) => void;
  currentUser: string;
  currentUserId?: string;
  onOpen: (expense: Expense) => void;
}) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className={col.className}
                aria-sort={
                  sort.key === col.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={cn(
                    "inline-flex items-center gap-1 font-medium uppercase hover:text-foreground",
                    sort.key === col.key && "text-foreground",
                  )}
                >
                  {col.label}
                  <ArrowUpDown className={cn("h-3 w-3", sort.key === col.key && "text-foreground")} />
                </button>
              </TableHead>
            ))}
            <TableHead className="hidden lg:table-cell">Next action</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((expense) => {
            const status = STATUS_META[expense.status];
            const next = nextActionFor(expense, currentUser, currentUserId);
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
                className="cursor-pointer outline-none odd:bg-muted/30 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 [&_td]:py-3"
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
                  {expense.held ? (
                    <AnimatedBadge status={HELD_META.tone} size="sm" contentKey="Held">
                      {HELD_META.label}
                    </AnimatedBadge>
                  ) : (
                    <AnimatedBadge status={status.tone} size="sm" className={statusBadgeClass(expense.status)}>
                      {status.label}
                    </AnimatedBadge>
                  )}
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
