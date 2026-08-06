"use client";
// The organization-wide activity feed: every decision and comment made by
// anyone in the org, restricted to Finance Head (the apex financial role).
// Distinct from the personal "My activity" dashboard widget, which only
// covers the signed-in user's own actions.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ExpenseDrawer } from "@/features/dashboard/expense-drawer";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import { KIND_FILTERS, matchesActivityQuery, type ActivityKindFilter } from "@/features/dashboard/my-activity";
import { KIND_META, formatMoney } from "@/features/dashboard/journey-meta";
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
    <section aria-label="Organization activity" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Organization activity</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every decision and comment made across the organization, by everyone.
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
                placeholder="Search by actor, requester, amount, claim..."
                aria-label="Search organization activity"
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as ActivityKindFilter)}
              aria-label="Filter organization activity by action"
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
        <p className="mt-4 text-sm text-muted-foreground">No activity has been recorded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {query ? <>No activity matches &ldquo;{query}&rdquo;.</> : "No activity matches this filter."}
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
                  onClick={() => openClaim(item.claimId)}
                  disabled={isLoading}
                  className="flex w-full items-start gap-3 rounded-lg py-3 text-left transition-colors first:pt-0 last:pb-0 hover:bg-muted/40 disabled:cursor-default"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.actorName} <span className="text-muted-foreground">{meta.label.toLowerCase()}</span>{" "}
                        <span className="text-muted-foreground">&middot;</span> {item.claimTitle}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {isLoading ? "Opening…" : item.date}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
                      <span>{item.claimRef}</span>
                      <span aria-hidden>&middot;</span>
                      <span>Raised by {item.requesterName}</span>
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
