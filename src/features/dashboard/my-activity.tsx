"use client";
// A personal audit trail: every decision and comment the current user has
// made on any claim, including ones no longer assigned to them (once you act
// on a claim it moves to the next stage and drops out of your workspace
// list, so this is the only place that action stays visible to you).

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { KIND_META, formatMoney } from "./journey-meta";
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
  { value: "takeover", label: "Taken over" },
  { value: "comment", label: "Commented" },
];

export function matchesActivityQuery(item: ActivityItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const meta = KIND_META[item.kind];
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
  onOpen,
  loadingClaimId,
}: {
  items: ActivityItem[];
  onOpen?: (claimId: string) => void;
  loadingClaimId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");

  const filtered = useMemo(
    () =>
      items
        .filter((item) => kindFilter === "all" || item.kind === kindFilter)
        .filter((item) => matchesActivityQuery(item, query)),
    [items, query, kindFilter],
  );

  return (
    <section aria-label="My activity" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">My activity</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Decisions and comments you have made, even on claims no longer assigned to you.
          </p>
        </div>
        {items.length > 0 ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by requester, amount, claim..."
                aria-label="Search my activity"
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as ActivityKindFilter)}
              aria-label="Filter my activity by action"
              className="rounded-lg border border-border bg-background py-1.5 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {KIND_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">You have not acted on any claims yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {query
            ? <>No activity matches &ldquo;{query}&rdquo;.</>
            : "No activity matches this filter."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {filtered.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            const isLoading = loadingClaimId === item.claimId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen?.(item.claimId)}
                  disabled={!onOpen || isLoading}
                  className="flex w-full items-start gap-3 rounded-lg py-3 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="truncate text-sm font-medium text-foreground">
                        {meta.label} <span className="text-muted-foreground">&middot;</span> {item.claimTitle}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {isLoading ? "Opening…" : item.date}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
                      <span>{item.claimRef}</span>
                      <span aria-hidden>&middot;</span>
                      <span>{item.requesterName}</span>
                      <span aria-hidden>&middot;</span>
                      <span>{formatMoney(item.amount, item.currency)}</span>
                    </p>
                    {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
