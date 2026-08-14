"use client";
// The org-wide finance expense list (ADR-0023): every claim in the
// organization at every stage, shown with the shared one-per-status filter
// section (ADR-0021). Clicking any row opens the shared ExpenseDrawer for
// viewing claim history, receipt, and details.

import { useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ExpenseEmployee } from "@/server/expenses/ports";
import { ExpenseDrawer } from "@/features/dashboard/expense-drawer";
import { ExpenseFilterSection } from "@/features/dashboard/expense-filter-section";
import type { ExpenseSortKey } from "@/features/dashboard/expense-query";
import { StatusBadge } from "@/features/dashboard/status-badge";
import { formatMoney } from "@/features/dashboard/journey-meta";
import type { Expense } from "@/features/dashboard/mock-data";

export interface OrgWideExpenseListProps {
  expenses: Expense[];
  employees: ExpenseEmployee[];
  currentUser?: string;
  currentUserId?: string;
  currentUserRoleId?: string;
  currentUserRoleCode?: string;
}

export function OrgWideExpenseList({
  expenses,
  employees,
  currentUser = "",
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
}: OrgWideExpenseListProps) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const requesterNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );

  function openExpense(expense: Expense) {
    setSelected(expense);
    setDrawerOpen(true);
  }

  return (
    <section
      aria-label="Organization expense list"
      className="rounded-2xl border border-border bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Expenses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every claim in the organization, at every stage. Click any row to view its details.
          </p>
        </div>
      </header>
      <ExpenseFilterSection expenses={expenses}>
        {({ rows, sort, onSort }) => (
          <ExpenseOverviewTable
            rows={rows}
            sort={sort}
            onSort={onSort}
            requesterNameById={requesterNameById}
            onOpen={openExpense}
          />
        )}
      </ExpenseFilterSection>

      <ExpenseDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        expense={selected}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        currentUserRoleCode={currentUserRoleCode}
      />
    </section>
  );
}

const SORT_COLUMNS: { key: ExpenseSortKey; label: string; className: string }[] = [
  { key: "title", label: "Expense", className: "pl-5" },
  { key: "category", label: "Category", className: "hidden md:table-cell" },
  { key: "date", label: "Date", className: "hidden sm:table-cell" },
  { key: "amount", label: "Amount", className: "text-right" },
  { key: "status", label: "Status", className: "hidden lg:table-cell" },
];

function ExpenseOverviewTable({
  rows,
  sort,
  onSort,
  requesterNameById,
  onOpen,
}: {
  rows: Expense[];
  sort: { key: ExpenseSortKey; dir: 1 | -1 };
  onSort: (key: ExpenseSortKey) => void;
  requesterNameById: ReadonlyMap<string, string>;
  onOpen: (expense: Expense) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {SORT_COLUMNS.map((col) => (
            <TableHead
              key={col.key}
              className={col.className}
              aria-sort={sort.key === col.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
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
          <TableHead className="hidden lg:table-cell">Requester</TableHead>
          <TableHead className="hidden xl:table-cell">Next stage</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((expense) => (
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
            <TableCell className="hidden text-muted-foreground sm:table-cell">{expense.date}</TableCell>
            <TableCell className="text-right font-medium tabular-nums text-foreground">
              {formatMoney(expense.amount, expense.currency)}
            </TableCell>
            <TableCell className="hidden max-w-[150px] whitespace-normal lg:table-cell">
              <StatusBadge status={expense.status} />
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {expense.requesterId ? (requesterNameById.get(expense.requesterId) ?? "-") : "-"}
            </TableCell>
            <TableCell className="hidden xl:table-cell">
              <p className="text-sm font-medium text-foreground">{expense.nextStage ?? "-"}</p>
              {expense.nextActor ? (
                <p className="text-xs text-muted-foreground">{expense.nextActor}</p>
              ) : null}
            </TableCell>
            <TableCell className="pr-4 text-right">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
              No expenses match your search.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
