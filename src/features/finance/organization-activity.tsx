"use client";

import { useMemo, useState } from "react";
import { Search, X, Activity, Filter } from "lucide-react";
import { ExpenseDrawer } from "@/features/dashboard/expense-drawer";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import { FILTER_DOT_COLOR } from "@/features/dashboard/journey-meta";
import { ActivityItemRow } from "@/features/dashboard/activity-item-row";
import { KIND_FILTERS, matchesActivityQuery, type ActivityKindFilter } from "@/features/dashboard/my-activity";
import type { ActivityItem, Expense } from "@/features/dashboard/mock-data";

export function OrganizationActivity({
  items,
  currentUser,
  currentUserId,
}: {
  items: ActivityItem[];
  currentUser: string;
  currentUserId?: string;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");
  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingClaimId, setLoadingClaimId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      items
        .filter((item) => kindFilter === "all" || item.kind === kindFilter)
        .filter((item) => matchesActivityQuery(item, query)),
    [items, query, kindFilter],
  );

  async function openClaim(claimId: string) {
    setLoadingClaimId(claimId);
    try {
      const response = await fetch(`/api/expenses/${claimId}`);
      if (response.ok) {
        const { claim, employees } = await response.json();
        setSelected(claimToExpense(claim, employees));
        setOpen(true);
      }
    } finally {
      setLoadingClaimId(null);
    }
  }

  return (
    <section aria-label="Organization activity" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              Organization activity
            </h2>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border/50">
              {filtered.length} {filtered.length === 1 ? "action" : "actions"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every decision and comment made across the organization, by everyone.
          </p>
        </div>

        {items.length > 0 ? (
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by actor, requester, claim, amount..."
                aria-label="Search organization activity"
                className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* Select Dropdown for Mobile / Compact view */}
            <div className="relative sm:hidden">
              <select
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as ActivityKindFilter)}
                aria-label="Filter organization activity by action"
                className="w-full rounded-xl border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                {KIND_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick Filter Chips (Pills with Status Indicator Dots) */}
      {items.length > 0 ? (
        <div className="mt-4 hidden flex-wrap items-center gap-1.5 border-t border-border/60 pt-4 sm:flex">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filter:
          </span>
          {KIND_FILTERS.map((option) => {
            const active = kindFilter === option.value;
            const dotColor = FILTER_DOT_COLOR[option.value];
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setKindFilter(option.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  active
                    ? "bg-primary text-primary-foreground shadow-2xs"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : dotColor}`} />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Activity List Content */}
      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
          <Activity className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium text-foreground">No activity recorded yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Org-wide actions will appear here as they occur.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {query ? <>No activity matching &ldquo;{query}&rdquo;</> : "No activity matches this filter"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search query or filter selection.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setKindFilter("all");
            }}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Clear search & filters
          </button>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border/60" role="list">
          {filtered.map((item) => (
            <li key={item.id} className="py-1">
              <ActivityItemRow
                item={item}
                onClick={() => openClaim(item.claimId)}
                isLoading={loadingClaimId === item.claimId}
                showActor={true}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Expense Details Drawer */}
      <ExpenseDrawer
        open={open}
        onOpenChange={setOpen}
        expense={selected}
        currentUser={currentUser}
        currentUserId={currentUserId}
      />
    </section>
  );
}
