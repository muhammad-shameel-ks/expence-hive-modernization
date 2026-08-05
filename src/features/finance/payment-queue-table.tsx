"use client";
// Searchable, filterable, sortable payment queue table for Finance and HR.
// Sortable by reference, category, submission date, amount, and status;
// filterable by awaiting-payment/paid, category, amount range, and submitted date range.

import { useMemo, useState } from "react";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";
import {
  approvedOnFor,
  filterAndSortPaymentQueue,
  paymentStatusFor,
  type PaymentQueueFilter,
  type PaymentQueueSortKey,
} from "./payment-queue-query";

const FILTERS: PaymentQueueFilter[] = ["All", "Awaiting payment", "Paid"];

const SORT_COLUMNS: { key: PaymentQueueSortKey; label: string; className: string }[] = [
  { key: "ref", label: "Reference", className: "" },
  { key: "category", label: "Category", className: "hidden md:table-cell" },
  { key: "submitted", label: "Bill submission", className: "hidden sm:table-cell" },
  { key: "amount", label: "Amount", className: "text-right" },
  { key: "status", label: "Status", className: "" },
];

export function PaymentQueueTable({ claims, employees = [] }: { claims: ExpenseClaim[]; employees?: ExpenseEmployee[] }) {
  const employeeNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentFor, setSavingCommentFor] = useState<string | null>(null);

  async function saveComment(claimId: string, value: string) {
    setSavingCommentFor(claimId);
    try {
      await fetch(`/api/expenses/${claimId}/comments`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comments: value }),
      });
      setComments((current) => ({ ...current, [claimId]: value }));
    } finally {
      setSavingCommentFor(null);
    }
  }

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaymentQueueFilter>("All");
  const [sort, setSort] = useState<{ key: PaymentQueueSortKey; dir: 1 | -1 }>({ key: "submitted", dir: -1 });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const allCategories = useMemo(
    () => Array.from(new Set(claims.map((claim) => claim.category))).sort(),
    [claims],
  );

  const activeAdvancedCount =
    categories.length +
    (amountMin !== "" ? 1 : 0) +
    (amountMax !== "" ? 1 : 0) +
    (dateFrom !== "" ? 1 : 0) +
    (dateTo !== "" ? 1 : 0);

  const rows = useMemo(
    () =>
      filterAndSortPaymentQueue(claims, {
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
    [claims, query, filter, sort, categories, amountMin, amountMax, dateFrom, dateTo],
  );

  const countFor = (f: PaymentQueueFilter) =>
    f === "All" ? claims.length : filterAndSortPaymentQueue(claims, { filter: f }).length;

  const toggleSort = (key: PaymentQueueSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "amount" || key === "submitted" ? -1 : 1 }));

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
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">Search claims</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, title, category…"
            className="h-9 w-full rounded-full border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>

        <div role="group" aria-label="Filter by payment status" className="flex flex-wrap gap-1.5">
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
      </div>

      {moreFiltersOpen ? (
        <div className="mb-4 flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
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
                Amount range (₹)
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

      <div className="overflow-x-auto rounded-xl border border-black/10">
        <table className="w-full min-w-[1600px] border-collapse text-sm">
          <thead>
            <tr className="bg-black/[0.03] text-left">
              <th className="px-4 py-3 font-medium">Name</th>
              {SORT_COLUMNS.map((col) => (
                <th key={col.key} className={cn("px-4 py-3 font-medium", col.className)}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 font-medium hover:text-foreground",
                      sort.key === col.key && "text-foreground",
                    )}
                  >
                    {col.label}
                    <ArrowUpDown className={cn("h-3 w-3", sort.key === col.key && "text-foreground")} />
                  </button>
                </th>
              ))}
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Bill invoice date</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Sub category</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Remark</th>
              <th className="px-4 py-3 font-medium">Account number</th>
              <th className="px-4 py-3 font-medium">IFSC code</th>
              <th className="px-4 py-3 font-medium">Payment status</th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">Approved on</th>
              <th className="min-w-[220px] px-4 py-3 font-medium">Comments</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={13}>
                  No claims match your search.
                </td>
              </tr>
            ) : (
              rows.map((claim) => {
                const approvedOn = approvedOnFor(claim);
                const commentValue = comments[claim.id] ?? claim.comments ?? "";
                return (
                  <tr key={claim.id} className="border-t border-black/10 odd:bg-muted/60">
                    <td className="px-4 py-3 text-foreground">{employeeNameById.get(claim.requesterId) ?? "-"}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{claim.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{claim.ref}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{claim.category}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {(claim.submittedAt ?? claim.createdAt).slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                      ₹{(claim.amountMinor / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">{claim.status}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{claim.expenseDate}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{claim.subCategory || "-"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">{claim.remark || "-"}</td>
                    <td className="px-4 py-3">{claim.payoutDetails?.accountNumber ?? "-"}</td>
                    <td className="px-4 py-3">{claim.payoutDetails?.ifscCode ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          paymentStatusFor(claim) === "Paid"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {paymentStatusFor(claim)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                      {approvedOn ? approvedOn.slice(0, 10) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={commentValue}
                        placeholder="Add a comment…"
                        aria-label={`Comment for ${claim.ref}`}
                        disabled={savingCommentFor === claim.id}
                        onBlur={(e) => {
                          if (e.target.value !== commentValue) saveComment(claim.id, e.target.value);
                        }}
                        className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
