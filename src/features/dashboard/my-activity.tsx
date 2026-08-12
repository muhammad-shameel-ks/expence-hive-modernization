"use client";
// A personal audit trail: every decision and comment the current user has
// made on any claim, including ones no longer assigned to them (once you act
// on a claim it moves to the next stage and drops out of your workspace
// list, so this is the only place that action stays visible to you).

import { useMemo, useState } from "react";
import { Search, X, Activity, Filter } from "lucide-react";
import { inPeriod, type DashboardPeriod } from "@/server/expenses/dashboard-read-models";
import { getKindMeta, FILTER_DOT_COLOR, formatMoney } from "./journey-meta";
import { ActivityItemRow } from "./activity-item-row";
import type { ActivityItem, HistoryKind } from "./mock-data";

export type ActivityKindFilter = "all" | HistoryKind;

// Only offer the kinds that can actually appear in an activity feed
// (ACTIVITY_EVENT_KINDS on the server). No draft/submitted/skipped here.
export const KIND_FILTERS: { value: ActivityKindFilter; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "verified", label: "Verified" },
  { value: "paid", label: "Paid" },
  { value: "delegated", label: "Delegated" },
  { value: "comment", label: "Commented" },
];

export function matchesActivityQuery(item: ActivityItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const meta = getKindMeta(item.kind);
  const haystack = [
    item.claimTitle,
    item.claimRef,
    item.claimCategory,
    item.requesterName,
    item.actorName ?? "",
    meta.label,
    item.detail ?? "",
    String(item.amount),
    formatMoney(item.amount, item.currency),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function MyActivity({
  items,
  period,
  onOpen,
  loadingClaimId,
}: {
  items: ActivityItem[];
  /** The dashboard's period switch (ADR-0020): the feed is bucketed to the same period as the cards. */
  period: DashboardPeriod;
  onOpen?: (claimId: string) => void;
  loadingClaimId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");

  // The period is the outer scope; search and the kind filter refine within
  // it. Items without a raw timestamp (test fixtures) only surface in the
  // overall view.
  const periodItems = useMemo(
    () => items.filter((item) => inPeriod(item.createdAt ?? "", period, new Date())),
    [items, period],
  );

  const filtered = useMemo(
    () =>
      periodItems
        .filter((item) => kindFilter === "all" || item.kind === kindFilter)
        .filter((item) => matchesActivityQuery(item, query)),
    [periodItems, query, kindFilter],
  );

  return (
    <section aria-label="My activity" className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              My activity
            </h2>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border/50">
              {filtered.length} {filtered.length === 1 ? "action" : "actions"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Decisions and comments you have made, even on claims no longer assigned to you.
          </p>
        </div>

        {periodItems.length > 0 ? (
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by requester, claim, amount..."
                aria-label="Search my activity"
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
                aria-label="Filter my activity by action"
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
      {periodItems.length > 0 ? (
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
          <p className="mt-2 text-sm font-medium text-foreground">You have not acted on any claims yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Your decisions and comments will appear here.</p>
        </div>
      ) : periodItems.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-foreground">No activity in this period</p>
          <p className="mt-1 text-xs text-muted-foreground">Switch to Overall to see everything.</p>
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
                onClick={onOpen ? () => onOpen(item.claimId) : undefined}
                isLoading={loadingClaimId === item.claimId}
                showActor={false}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
