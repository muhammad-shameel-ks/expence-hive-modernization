"use client";
// The shared filter/sort section used on every expense-list surface (ADR-0021):
// one-per-status quick chips (All + each status in STATUS_META order) plus an
// advanced layer (search, status multi-select, category, amount range, date
// range, sort) folded behind a "More filters" button. The dashboard's "Your
// Expense" card and /expenses/all both render this same component, so behavior
// and visuals never drift.
//
// Period interplay (dashboard): the period switch (ADR-0020) is server-side -
// it buckets the claims before this section receives them. The chips and
// advanced filters are client-side and layer on top of that bucket. Because
// the filter state round-trips through the URL, a period switch (which
// refreshes the route server-side) preserves the active filters instead of
// resetting them.
//
// URL sync: every change is written back to the query string with
// router.replace (no history pollution, scroll preserved), and back/forward
// navigation re-applies the URL state. A filtered view therefore survives
// refresh, navigation, and can be linked. Unrelated params (e.g. the
// dashboard's `?claim=` deep link) are preserved.
//
// Mobile: below the sm breakpoint the whole section collapses to a single
// "Filters" affordance that expands the chips and the advanced layer inline
// above the list.
//
// Statuses: chips are a single-status shortcut. The advanced status
// checkboxes are a multi-select over the same statuses (the old grouped
// intents - needs action, in progress - stay expressible by checking the
// statuses they covered); selecting any checkbox clears the quick chip and
// vice versa, so the two layers never intersect into an empty result.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  expenseFilterKey,
  expenseFilterParams,
  filterAndSortExpenses,
  parseExpenseSearchParams,
  QUICK_STATUS_CHIPS,
  STATUS_CHIP_META,
  type ExpenseFilter,
  type ExpenseQuery,
  type ExpenseSortKey,
} from "./expense-query";
import type { Expense, ExpenseStatus } from "./mock-data";

const MOBILE_QUERY = "(max-width: 639px)";

function subscribeToMobileQuery(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(MOBILE_QUERY);
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener?.(onChange);
  return () => query.removeListener?.(onChange);
}

function getMobileSnapshot() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(MOBILE_QUERY).matches
    : false;
}

function useIsMobile() {
  // `null` is the server snapshot so hydration never commits a desktop viewer
  // before the client has resolved the actual breakpoint.
  return useSyncExternalStore(subscribeToMobileQuery, getMobileSnapshot, () => null);
}

const SORT_OPTIONS: { value: string; label: string; key: ExpenseSortKey; dir: 1 | -1 }[] = [
  { value: "date-desc", label: "Newest first", key: "date", dir: -1 },
  { value: "date-asc", label: "Oldest first", key: "date", dir: 1 },
  { value: "amount-desc", label: "Amount: highest first", key: "amount", dir: -1 },
  { value: "amount-asc", label: "Amount: lowest first", key: "amount", dir: 1 },
  { value: "title-asc", label: "Title: A to Z", key: "title", dir: 1 },
  { value: "category-asc", label: "Category: A to Z", key: "category", dir: 1 },
  { value: "status-asc", label: "Status: journey order", key: "status", dir: 1 },
];

export interface ExpenseFilterResult {
  /** The source list after every filter and sort is applied. */
  rows: Expense[];
  /** Whether any filter (chip, search, statuses, category, amount, date) is active - sort does not count. */
  hasActiveFilters: boolean;
  /** Number of active filters, for badges. */
  activeFilterCount: number;
  /** The current column sort. */
  sort: { key: ExpenseSortKey; dir: 1 | -1 };
  /** Sort by a column, toggling direction when the same column is chosen again. */
  onSort: (key: ExpenseSortKey) => void;
}

export function ExpenseFilterSection({
  expenses,
  children,
}: {
  expenses: Expense[];
  children: (result: ExpenseFilterResult) => ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<ExpenseQuery>(() => parseExpenseSearchParams(searchParams));
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const isMobile = useIsMobile();

  const update = (patch: Partial<ExpenseQuery>) => setQuery((q) => ({ ...q, ...patch }));

  // URL -> state: re-apply the URL after back/forward navigation (or any
  // external rewrite). This is the React-docs "adjust state during render"
  // pattern, not an effect, so a back/forward re-render never fights a
  // keystroke that is in flight. The canonical-key comparison makes it
  // idempotent: parsing and serialization normalize to the same key.
  const urlQuery = parseExpenseSearchParams(searchParams);
  const urlKey = expenseFilterKey(urlQuery);
  const [syncedUrlKey, setSyncedUrlKey] = useState(urlKey);
  if (syncedUrlKey !== urlKey) {
    setSyncedUrlKey(urlKey);
    setQuery(urlQuery);
  }

  // State -> URL: write every user change back to the query string. The
  // previous-key guard skips re-writes that back/forward navigation triggers,
  // so the browser history entry we just landed on is not replaced.
  const lastQueryKey = useRef(expenseFilterKey(query));
  useEffect(() => {
    const key = expenseFilterKey(query);
    if (key === lastQueryKey.current) return;
    lastQueryKey.current = key;
    router.replace(`${pathname}?${expenseFilterParams(query, searchParams).toString()}`, { scroll: false });
  }, [query, pathname, router, searchParams]);

  const rows = useMemo(() => filterAndSortExpenses(expenses, query), [expenses, query]);

  const chipCounts = useMemo(() => {
    const counts = new Map<ExpenseFilter, number>();
    counts.set("All", expenses.length);
    for (const chip of QUICK_STATUS_CHIPS) {
      if (chip.filter === "All") continue;
      counts.set(chip.filter, filterAndSortExpenses(expenses, { filter: chip.filter }).length);
    }
    return counts;
  }, [expenses]);

  const allCategories = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses],
  );

  const advancedCount =
    (query.statuses?.length ?? 0) +
    (query.categories?.length ?? 0) +
    (query.amountMin !== undefined ? 1 : 0) +
    (query.amountMax !== undefined ? 1 : 0) +
    (query.dateFrom ? 1 : 0) +
    (query.dateTo ? 1 : 0) +
    (query.query?.trim() ? 1 : 0);
  const activeFilterCount = advancedCount + (query.filter ? 1 : 0);

  const sortKey = query.sortKey ?? "date";
  const sortDir = query.sortDir ?? -1;

  const selectFilter = (filter: ExpenseFilter) => {
    setQuery((q) => ({ ...q, filter: filter === "All" ? undefined : filter, statuses: undefined }));
  };

  const toggleStatus = (status: ExpenseStatus) => {
    setQuery((q) => {
      // The active chip seeds the multi-select, so checking another status
      // extends the chip's status instead of silently dropping it. The chip
      // is a status by construction here (All is normalized to undefined).
      const seeded = q.statuses ?? (q.filter && q.filter !== "All" ? [q.filter] : []);
      const statuses = seeded.includes(status) ? seeded.filter((s) => s !== status) : [...seeded, status];
      return { ...q, filter: undefined, statuses: statuses.length > 0 ? statuses : undefined };
    });
  };

  const toggleCategory = (category: string) =>
    setQuery((q) => {
      const current = q.categories ?? [];
      const categories = current.includes(category) ? current.filter((c) => c !== category) : [...current, category];
      return { ...q, categories: categories.length > 0 ? categories : undefined };
    });

  const toggleSort = (key: ExpenseSortKey) => {
    const dir =
      key === sortKey ? (sortDir === 1 ? -1 : 1) : key === "amount" || key === "date" ? -1 : 1;
    update({ sortKey: key, sortDir: dir });
  };

  const selectSort = (value: string) => {
    const option = SORT_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    update({ sortKey: option.key, sortDir: option.dir });
  };

  const onAmountChange = (field: "amountMin" | "amountMax", raw: string) => {
    const value = raw.trim();
    const parsed = Number(value);
    update({ [field]: value === "" || !Number.isFinite(parsed) ? undefined : parsed });
  };

  const clearAdvancedFilters = () =>
    setQuery((q) => ({
      ...q,
      query: undefined,
      filter: undefined,
      statuses: undefined,
      categories: undefined,
      amountMin: undefined,
      amountMax: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    }));

  const result: ExpenseFilterResult = {
    rows,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
    sort: { key: sortKey, dir: sortDir },
    onSort: toggleSort,
  };

  // The chips are "All" + one per status (ADR-0021); All is pressed only when
  // no status selection at all is active.
  const isAllActive = !query.filter && !query.statuses?.length;

  return (
    <div>
      {isMobile !== true ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {QUICK_STATUS_CHIPS.map((chip) => (
              <StatusChip
                key={chip.filter}
                label={chip.label}
                count={chipCounts.get(chip.filter)}
                active={chip.filter === "All" ? isAllActive : query.filter === chip.filter}
                onClick={() => selectFilter(chip.filter)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-expanded={moreFiltersOpen}
            aria-controls="expense-more-filters"
            onClick={() => setMoreFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            More filters
            {advancedCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {advancedCount}
              </span>
            ) : null}
          </Button>
        </div>
      ) : (
        <div className="px-5 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            aria-expanded={mobileFiltersOpen}
            aria-controls="expense-mobile-filters"
            onClick={() => setMobileFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{" "}
            {activeFilterCount > 0 ? (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>
      )}

      {isMobile === true && mobileFiltersOpen ? (
        <div id="expense-mobile-filters" className="mx-5 mb-4 flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {QUICK_STATUS_CHIPS.map((chip) => (
              <StatusChip
                key={chip.filter}
                label={chip.label}
                count={chipCounts.get(chip.filter)}
                active={chip.filter === "All" ? isAllActive : query.filter === chip.filter}
                onClick={() => selectFilter(chip.filter)}
              />
            ))}
          </div>
          <AdvancedFilters
            query={query}
            allCategories={allCategories}
            sortKey={sortKey}
            sortDir={sortDir}
            onSearch={(value) => update({ query: value })}
            onToggleStatus={toggleStatus}
            onToggleCategory={toggleCategory}
            onAmountChange={onAmountChange}
            onDateChange={(field, value) => update({ [field]: value || undefined })}
            onSortSelect={selectSort}
            onClear={clearAdvancedFilters}
            advancedCount={advancedCount}
          />
        </div>
      ) : null}

      {isMobile !== true && moreFiltersOpen ? (
        <div id="expense-more-filters" className="mx-5 mb-4 flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <AdvancedFilters
            query={query}
            allCategories={allCategories}
            sortKey={sortKey}
            sortDir={sortDir}
            onSearch={(value) => update({ query: value })}
            onToggleStatus={toggleStatus}
            onToggleCategory={toggleCategory}
            onAmountChange={onAmountChange}
            onDateChange={(field, value) => update({ [field]: value || undefined })}
            onSortSelect={selectSort}
            onClear={clearAdvancedFilters}
            advancedCount={advancedCount}
          />
        </div>
      ) : null}

      {children(result)}
    </div>
  );
}

function StatusChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label} <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function AdvancedFilters({
  query,
  allCategories,
  sortKey,
  sortDir,
  onSearch,
  onToggleStatus,
  onToggleCategory,
  onAmountChange,
  onDateChange,
  onSortSelect,
  onClear,
  advancedCount,
}: {
  query: ExpenseQuery;
  allCategories: string[];
  sortKey: ExpenseSortKey;
  sortDir: 1 | -1;
  onSearch: (value: string) => void;
  onToggleStatus: (status: ExpenseStatus) => void;
  onToggleCategory: (category: string) => void;
  onAmountChange: (field: "amountMin" | "amountMax", raw: string) => void;
  onDateChange: (field: "dateFrom" | "dateTo", value: string) => void;
  onSortSelect: (value: string) => void;
  onClear: () => void;
  advancedCount: number;
}) {
  return (
    <>
      <div>
        <label htmlFor="expense-filter-search" className="sr-only">
          Search expenses
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="expense-filter-search"
            type="search"
            value={query.query ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search title, ref, category…"
            className="h-9 w-full rounded-full border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      <div role="group" aria-label="Statuses">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statuses</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {STATUS_CHIP_META.map(({ status, label }) => {
            const checked = query.filter === status || query.statuses?.includes(status) === true;
            return (
              <label key={status} className="flex min-h-6 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleStatus(status)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      <div role="group" aria-label="Category">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onToggleCategory(category)}
              aria-pressed={query.categories?.includes(category) === true}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                query.categories?.includes(category)
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
        <div role="group" aria-label="Amount range">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount range</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={query.amountMin === undefined ? "" : String(query.amountMin)}
              onChange={(e) => onAmountChange("amountMin", e.target.value)}
              placeholder="Min"
              aria-label="Minimum amount"
              className="h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={query.amountMax === undefined ? "" : String(query.amountMax)}
              onChange={(e) => onAmountChange("amountMax", e.target.value)}
              placeholder="Max"
              aria-label="Maximum amount"
              className="h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
        </div>

        <div role="group" aria-label="Submitted between">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submitted between</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={query.dateFrom ?? ""}
              onChange={(e) => onDateChange("dateFrom", e.target.value)}
              aria-label="Submitted from date"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              value={query.dateTo ?? ""}
              onChange={(e) => onDateChange("dateTo", e.target.value)}
              aria-label="Submitted to date"
              className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
        </div>
      </div>

      <div role="group" aria-label="Sort expenses">
        <label htmlFor="expense-filter-sort" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sort by
        </label>
        <select
          id="expense-filter-sort"
          value={`${sortKey}-${sortDir === 1 ? "asc" : "desc"}`}
          onChange={(e) => onSortSelect(e.target.value)}
          className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {advancedCount > 0 ? (
        <Button variant="ghost" size="sm" className="gap-1 self-start text-muted-foreground" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      ) : null}
    </>
  );
}
