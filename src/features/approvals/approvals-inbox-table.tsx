"use client";

// The approvals inbox table (ADR-0029): a dedicated view for managers and
// finance heads to review and approve pending claims in bulk or individually.
// Supports multi-select checkboxes, search, category & date filters, sorting,
// a bulk confirmation dialog with optional approval comment, and drawer inspection.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCheck,
  ChevronRight,
  Inbox,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { BulkApproveReport } from "@/server/expenses/commands";
import { MAX_APPROVAL_COMMENT_LENGTH, type ExpenseEmployee } from "@/server/expenses/ports";
import { ExpenseDrawer } from "@/features/dashboard/expense-drawer";
import { formatMoney } from "@/features/dashboard/journey-meta";
import type { Expense } from "@/features/dashboard/mock-data";
import { StatusBadge } from "@/features/dashboard/status-badge";
import {
  isSelectionAllSelected,
  isSelectionIndeterminate,
  toggleAllSelection,
  toggleClaimSelection,
} from "./approvals-selection";

export type ApprovalsSortKey = "title" | "employee" | "category" | "date" | "amount";

export interface ApprovalsInboxTableProps {
  expenses: Expense[];
  employees: ExpenseEmployee[];
  currentUser?: string;
  currentUserId?: string;
  currentUserRoleId?: string;
  currentUserRoleCode?: string;
}

export function ApprovalsInboxTable({
  expenses,
  employees,
  currentUser = "",
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
}: ApprovalsInboxTableProps) {
  const router = useRouter();

  // Selection state
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Filter & Search state
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  // Sorting state
  const [sortKey, setSortKey] = useState<ApprovalsSortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // default newest first

  // Drawer inspection state
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Bulk approval modal & execution state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkApproveReport | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Employee lookup map
  const employeeById = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp])),
    [employees],
  );

  // Available categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const exp of expenses) {
      if (exp.category) set.add(exp.category);
    }
    return Array.from(set).sort();
  }, [expenses]);

  // Filter and sort rows
  const filteredRows = useMemo(() => {
    let list = expenses;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((exp) => {
        const titleMatch = exp.title.toLowerCase().includes(q);
        const refMatch = exp.ref.toLowerCase().includes(q);
        const categoryMatch = exp.category.toLowerCase().includes(q);
        const employeeName = exp.requesterId ? employeeById.get(exp.requesterId)?.name.toLowerCase() : "";
        const requesterMatch = employeeName ? employeeName.includes(q) : false;
        return titleMatch || refMatch || categoryMatch || requesterMatch;
      });
    }

    if (selectedCategory !== "all") {
      list = list.filter((exp) => exp.category === selectedCategory);
    }

    if (dateFrom) {
      list = list.filter((exp) => exp.submittedAt.slice(0, 10) >= dateFrom);
    }

    if (dateTo) {
      list = list.filter((exp) => exp.submittedAt.slice(0, 10) <= dateTo);
    }

    return [...list].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "employee": {
          const nameA = a.requesterId ? employeeById.get(a.requesterId)?.name ?? "" : "";
          const nameB = b.requesterId ? employeeById.get(b.requesterId)?.name ?? "" : "";
          comparison = nameA.localeCompare(nameB);
          break;
        }
        case "category":
          comparison = (a.category ?? "").localeCompare(b.category ?? "");
          break;
        case "date": {
          comparison = a.submittedAt.localeCompare(b.submittedAt);
          break;
        }
        case "amount":
          comparison = a.amount - b.amount;
          break;
      }
      return comparison * sortDir;
    });
  }, [expenses, search, selectedCategory, dateFrom, dateTo, sortKey, sortDir, employeeById]);

  const filteredClaimIds = useMemo(
    () => filteredRows.map((row) => row.id),
    [filteredRows],
  );

  // Sync select-all indeterminate state
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSelectionIndeterminate(
        selectedClaimIds,
        filteredClaimIds,
      );
    }
  }, [selectedClaimIds, filteredClaimIds]);

  // Selected items calculation
  const selectedExpenses = useMemo(
    () => expenses.filter((exp) => selectedClaimIds.has(exp.id)),
    [expenses, selectedClaimIds],
  );

  const selectedTotalAmount = useMemo(
    () => selectedExpenses.reduce((sum, exp) => sum + exp.amount, 0),
    [selectedExpenses],
  );

  const activeAdvancedCount =
    (selectedCategory !== "all" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  function handleSort(key: ApprovalsSortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? -1 : 1);
    }
  }

  function openExpense(expense: Expense) {
    setSelectedExpense(expense);
    setDrawerOpen(true);
  }

  function clearAdvancedFilters() {
    setSelectedCategory("all");
    setDateFrom("");
    setDateTo("");
  }

  async function executeBulkApproval() {
    if (selectedClaimIds.size === 0 || approving) return;
    setApproving(true);
    setActionError(null);
    setBulkResult(null);
    setSuccessNotice(null);

    try {
      const response = await fetch("/api/expenses/bulk-approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimIds: Array.from(selectedClaimIds),
          ...(approvalComment.trim() ? { comment: approvalComment.trim() } : {}),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(
          (data as { message?: string } | null)?.message ??
            "The bulk approval could not be completed. Please try again.",
        );
        return;
      }

      const report = (data as { report?: BulkApproveReport })?.report;
      if (!report) {
        setActionError("The server returned an unexpected response.");
        return;
      }

      setBulkResult(report);
      setConfirmModalOpen(false);
      setApprovalComment("");

      // Remove approved claims from selection
      const approvedIds = new Set(report.approved.map((claim) => claim.id));
      setSelectedClaimIds((current) => new Set([...current].filter((id) => !approvedIds.has(id))));

      if (report.approved.length > 0 && report.skipped.length === 0) {
        setSuccessNotice(
          `Successfully approved ${report.approved.length} expense ${
            report.approved.length === 1 ? "claim" : "claims"
          }.`,
        );
      }

      router.refresh();
    } catch {
      setActionError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top Banner Feedbacks */}
      {successNotice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
        >
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:hover:text-emerald-100"
            aria-label="Dismiss success notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive hover:opacity-80"
            aria-label="Dismiss error notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {bulkResult && bulkResult.skipped.length > 0 ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">
              Approval completed with warnings: {bulkResult.approved.length} approved,{" "}
              {bulkResult.skipped.length} skipped.
            </p>
            <button
              type="button"
              onClick={() => setBulkResult(null)}
              className="text-amber-800 hover:text-amber-950 dark:hover:text-amber-100"
              aria-label="Dismiss warning report"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-800 dark:text-amber-300">
            {bulkResult.skipped.map((skip) => {
              const claim = expenses.find((c) => c.id === skip.claimId);
              return (
                <li key={skip.claimId}>
                  <span className="font-mono">{claim?.ref ?? skip.claimId}</span>: {skip.message}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Main Container Card */}
      <section
        aria-label="Approvals inbox"
        className="flex flex-col rounded-2xl border border-border bg-card shadow-sm"
      >
        {/* Card Header and Search / Filter Bar */}
        <div className="flex flex-col gap-4 border-b border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Pending approvals ({expenses.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Select claims to approve in bulk or click any row to review details in full.
              </p>
            </div>

            {/* Bulk Action Controls */}
            {selectedClaimIds.size > 0 ? (
              <div className="flex items-center gap-2.5">
                <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {selectedClaimIds.size} selected · {formatMoney(selectedTotalAmount)}
                </span>
                <Button
                  size="sm"
                  className="gap-1.5 font-medium"
                  onClick={() => setConfirmModalOpen(true)}
                >
                  <CheckCheck className="h-4 w-4" />
                  Approve selected ({selectedClaimIds.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClaimIds(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              </div>
            ) : null}
          </div>

          {/* Search and Filter Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, ref, employee..."
                aria-label="Search pending approvals"
                className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            {categories.length > 0 ? (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter by category"
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <option value="all">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMoreFiltersOpen((v) => !v)}
              className={cn("gap-1.5", moreFiltersOpen && "border-primary text-primary")}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeAdvancedCount > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.2 text-[10px] text-primary-foreground font-semibold">
                  {activeAdvancedCount}
                </span>
              ) : null}
            </Button>
          </div>

          {/* Expanded Advanced Filters */}
          {moreFiltersOpen ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Date range:</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="Filter from date"
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <span className="text-xs text-muted-foreground">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="Filter to date"
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              {activeAdvancedCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAdvancedFilters}
                  className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Reset filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Table Content */}
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              No expenses awaiting your approval
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You are all caught up. When an employee submits a reimbursement requiring your approval,
              it will appear here.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No expense claims match your active search and filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 pl-5">
                    <input
                      type="checkbox"
                      ref={selectAllRef}
                      checked={isSelectionAllSelected(selectedClaimIds, filteredClaimIds)}
                      onChange={() =>
                        setSelectedClaimIds((current) =>
                          toggleAllSelection(current, filteredClaimIds),
                        )
                      }
                      aria-label="Select all claims in list"
                      className="size-4 rounded border-input text-primary accent-primary"
                    />
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      onClick={() => handleSort("title")}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground text-xs"
                    >
                      Expense
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort("employee")}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground text-xs"
                    >
                      Requester
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort("category")}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground text-xs"
                    >
                      Category
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <button
                      type="button"
                      onClick={() => handleSort("date")}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground text-xs"
                    >
                      Date
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("amount")}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-foreground text-xs"
                    >
                      Amount
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Status</TableHead>
                  <TableHead className="w-10 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((expense) => {
                  const requester = expense.requesterId
                    ? employeeById.get(expense.requesterId)
                    : undefined;
                  const isSelected = selectedClaimIds.has(expense.id);

                  return (
                    <TableRow
                      key={expense.id}
                      data-selected={isSelected ? "true" : undefined}
                      tabIndex={0}
                      onClick={() => openExpense(expense)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openExpense(expense);
                        }
                      }}
                      className={cn(
                        "cursor-pointer outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 [&_td]:py-3.5",
                        isSelected && "bg-primary/[0.04] hover:bg-primary/[0.08]",
                      )}
                    >
                      <TableCell
                        className="pl-5"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedClaimIds((current) =>
                              toggleClaimSelection(current, expense.id),
                            )
                          }
                          aria-label={`Select claim ${expense.ref}`}
                          className="size-4 rounded border-input text-primary accent-primary"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{expense.title}</p>
                          <p className="font-mono text-xs text-muted-foreground">{expense.ref}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm font-medium text-foreground">
                          {requester?.name ?? "Employee"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {requester?.role?.displayName ?? "Requester"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="inline-flex rounded-full bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
                          {expense.category}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {expense.date || expense.submittedAt.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-foreground">
                        {formatMoney(expense.amount, expense.currency)}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <StatusBadge status={expense.status} />
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Bulk Approval Confirmation Modal */}
      <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {selectedClaimIds.size} expense claims</DialogTitle>
            <DialogDescription>
              You are approving {selectedClaimIds.size}{" "}
              {selectedClaimIds.size === 1 ? "claim" : "claims"} totaling{" "}
              <strong className="text-foreground">{formatMoney(selectedTotalAmount)}</strong> in
              bulk.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Selected Claims Overview */}
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3 divide-y divide-border">
              {selectedExpenses.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between py-1.5 text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-medium text-foreground">{exp.title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{exp.ref}</p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatMoney(exp.amount, exp.currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Optional Approval Comment */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-approval-comment"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Approval note (optional)
              </label>
              <textarea
                id="bulk-approval-comment"
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value.slice(0, MAX_APPROVAL_COMMENT_LENGTH))}
                maxLength={MAX_APPROVAL_COMMENT_LENGTH}
                rows={3}
                placeholder="Add a remark to record on each approved claim's timeline..."
                className="w-full resize-none rounded-xl border border-input bg-card p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <span className="self-end text-[11px] text-muted-foreground">
                {approvalComment.length} / {MAX_APPROVAL_COMMENT_LENGTH}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmModalOpen(false)}
              disabled={approving}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void executeBulkApproval()}
              disabled={approving}
              className="gap-1.5"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {approving ? "Approving..." : `Confirm & Approve (${selectedClaimIds.size})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Drawer for Detailed Inspection */}
      <ExpenseDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        expense={selectedExpense}
        currentUser={currentUser}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        currentUserRoleCode={currentUserRoleCode}
      />
    </div>
  );
}
