"use client";
// Searchable, filterable expense table for the dashboard.
// Row click opens the right drawer. Sortable by expense, category, status,
// date, and amount; filterable by status, category, amount range, and date range.

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/ui/button";
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

const SORT_COLUMNS: { key: ExpenseSortKey; label: string; className: string }[] = [
  { key: "title", label: "Expense", className: "pl-5" },
  { key: "category", label: "Category", className: "hidden md:table-cell" },
  { key: "date", label: "Date", className: "hidden sm:table-cell" },
  { key: "amount", label: "Amount", className: "text-right" },
  { key: "status", label: "Status", className: "hidden lg:table-cell" },
];

export function ExpenseTable({
  expenses,
  currentUser,
  currentUserId,
  onOpen,
  searchable = false,
  filterable = false,
}: {
  expenses: Expense[];
  currentUser: string;
  currentUserId?: string;
  onOpen: (expense: Expense) => void;
  searchable?: boolean;
  filterable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ExpenseFilter>("All");
  const [sort, setSort] = useState<{ key: ExpenseSortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allCategories = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses],
  );

  const activeAdvancedCount =
    categories.length +
    (amountMin !== "" ? 1 : 0) +
    (amountMax !== "" ? 1 : 0) +
    (dateFrom !== "" ? 1 : 0) +
    (dateTo !== "" ? 1 : 0);

  const rows = useMemo(
    () =>
      filterAndSortExpenses(expenses, {
        query,
        filter,
        sortKey: sort.key,
        sortDir: sort.dir,
        categories: categories.length > 0 ? categories : undefined,
        amountMin: amountMin !== "" ? Number(amountMin) : undefined,
        amountMax: amountMax !== "" ? Number(amountMax) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [expenses, query, filter, sort, categories, amountMin, amountMax, dateFrom, dateTo],
  );

  const countFor = (f: ExpenseFilter) =>
    f === "All" ? expenses.length : filterAndSortExpenses(expenses, { filter: f }).length;

  const toggleSort = (key: ExpenseSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "amount" || key === "date" ? -1 : 1 }));

  const toggleCategory = (category: string) =>
    setCategories((cs) => (cs.includes(category) ? cs.filter((c) => c !== category) : [...cs, category]));

  const clearAdvancedFilters = () => {
    setCategories([]);
    setAmountMin("");
    setAmountMax("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div>
      {(searchable || filterable) && (
        <div className="flex flex-wrap items-center gap-3 px-5 pb-4">
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
          {filterable && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              aria-expanded={moreFiltersOpen}
              onClick={() => setMoreFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeAdvancedCount > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {activeAdvancedCount}
                </span>
              ) : null}
            </Button>
          )}
        </div>
      )}

      {filterable && moreFiltersOpen ? (
        <div className="mx-5 mb-4 flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-pressed={categories.includes(category)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    categories.includes(category)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Amount range
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder="Min"
                  aria-label="Minimum amount"
                  className="h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  placeholder="Max"
                  aria-label="Maximum amount"
                  className="h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Submitted between
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Submitted from date"
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <span className="text-muted-foreground">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Submitted to date"
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>
            </div>

            {activeAdvancedCount > 0 ? (
              <Button variant="ghost" size="sm" className="gap-1 self-end text-muted-foreground" onClick={clearAdvancedFilters}>
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {SORT_COLUMNS.map((col) => (
              <TableHead key={col.key} className={col.className}>
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
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
