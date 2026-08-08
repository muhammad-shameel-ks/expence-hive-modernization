"use client";
// Searchable, filterable, sortable payment queue table for Finance.
// Sortable by reference, category, submission date, amount, and status;
// filterable by awaiting-payment/paid, category, amount range, and submitted date range.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Download, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { downloadClaimSummary } from "@/lib/download-claim-summary";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";
import { isTerminalPoolEligible } from "@/features/dashboard/next-action";
import { ReceiptPreview } from "@/features/receipts/receipt-preview";
import { hasReceiptAttachment, selectedClaimFor, stepSelection } from "./payment-queue-selection";
import {
  approvedOnFor,
  filterAndSortPaymentQueue,
  paymentStatusFor,
  type PaymentQueueFilter,
  type PaymentQueueSortKey,
} from "./payment-queue-query";
import {
  PAYMENT_QUEUE_COLUMNS,
  type PaymentQueueColumn,
  type PaymentQueueColumnHelpers,
  type PaymentQueueColumnTextHelpers,
} from "./payment-queue-columns";
import {
  buildAndDownloadXlsx,
  type PaymentQueueExportScope,
} from "./payment-queue-export";

const FILTERS: PaymentQueueFilter[] = ["All", "Awaiting payment", "Paid", "Rejected"];

const exportOptionClassName =
  "flex w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export function PaymentQueueTable({
  claims,
  employees = [],
  currentUserId,
  currentUserRoleId,
}: {
  claims: ExpenseClaim[];
  employees?: ExpenseEmployee[];
  /** Viewer id; the terminal-stage pool gate uses it to exclude self-claims. */
  currentUserId?: string;
  /** Viewer role id; the terminal-stage pool gate compares it against the claim's current step role. */
  currentUserRoleId?: string;
}) {
  const employeeNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentFor, setSavingCommentFor] = useState<string | null>(null);
  const [actingClaimId, setActingClaimId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  // Verify/pay the terminal stage straight from the queue: any active
  // reviewer holding the terminal step's role may act, mirroring the
  // server's requireTerminalPoolClaim (which checks the claim's terminal
  // step). Success refreshes the queue so the row's state comes back from
  // the server.
  async function runTerminalAction(claim: ExpenseClaim) {
    if (actingClaimId) return;
    const terminal = claim.steps[claim.steps.length - 1];
    const action = terminal?.status === "verified" ? "pay" : "verify";
    setActingClaimId(claim.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/expenses/${claim.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setActionError(
          (body as { message?: string } | null)?.message ??
            "The action could not be completed. Please try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setActionError("Could not reach the server. Check your connection and try again.");
    } finally {
      setActingClaimId(null);
    }
  }

  // The terminal action the viewer may take on a claim straight from the
  // queue: any active reviewer holding the terminal step's role may act,
  // mirroring the server's requireTerminalPoolClaim (which checks the
  // claim's terminal step).
  const terminalActionFor = (claim: ExpenseClaim): "verify" | "pay" | null => {
    if (claim.status !== "in-finance") return null;
    const terminalStep = claim.steps[claim.steps.length - 1];
    if (!terminalStep || (terminalStep.status !== "pending" && terminalStep.status !== "verified")) {
      return null;
    }
    if (!isTerminalPoolEligible(claim, currentUserId, currentUserRoleId)) return null;
    return terminalStep.status === "verified" ? "pay" : "verify";
  };

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

  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const panelRef = useRef<HTMLElement | null>(null);
  const previewButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const selected = selectedClaimFor(claims, selectedClaimId);
  const selectedHasReceipt = selected ? hasReceiptAttachment(selected) : false;

  function openPanel(claimId: string) {
    setSelectedClaimId(claimId);
    // The panel does not exist in the DOM until the next render; focus it
    // after paint so screen-reader users land on the panel contents.
    requestAnimationFrame(() => panelRef.current?.focus());
  }

  function closePanel() {
    const claimId = selectedClaimId;
    setSelectedClaimId(null);
    // Return focus to the row that opened the panel (a no-op if the row was
    // filtered out while the panel was open, in which case the button is gone).
    if (claimId) {
      requestAnimationFrame(() => previewButtonRefs.current.get(claimId)?.focus());
    }
  }

  useEffect(() => {
    if (!selectedClaimId) return;
    const row = rowRefs.current.get(selectedClaimId);
    if (!row) return;
    // On small screens the panel is a fixed overlay covering the table, so
    // scrolling the row into view would only scroll the hidden page behind it.
    if (window.matchMedia("(min-width: 1024px)").matches) {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [selectedClaimId]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PaymentQueueFilter>("All");
  const [sort, setSort] = useState<{ key: PaymentQueueSortKey; dir: 1 | -1 }>({ key: "submitted", dir: -1 });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
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

  // Defined after the rows memo above: react-hooks/preserve-manual-memoization
  // flags a hoisted handler that reads a value declared later in the body.
  function handleTableKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    // Arrow keys inside the comment inputs move the text caret; never hijack.
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSelectedClaimId(stepSelection(rows, selectedClaimId, direction));
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
    }
  }

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

  const columnHelpers: PaymentQueueColumnHelpers = {
    employeeNameById,
    paymentStatusFor,
    approvedOnFor,
    hasReceiptAttachment,
    rowSelectedFor: (claimId) => selectedClaimId === claimId,
    previewButtonRefFor: (claimId) => (el) => {
      if (el) previewButtonRefs.current.set(claimId, el);
      else previewButtonRefs.current.delete(claimId);
    },
    onToggleReceiptPreview: (claimId) => {
      if (selectedClaimId === claimId) {
        closePanel();
      } else {
        openPanel(claimId);
      }
    },
    actingClaimId,
    terminalActionFor,
    onTerminalAction: runTerminalAction,
    commentValueFor: (claim) => comments[claim.id] ?? claim.comments ?? "",
    savingCommentFor,
    onSaveComment: saveComment,
  };

  // The Excel export only needs the data-facing helpers, never the DOM
  // concerns (refs, handlers, loading state) in the render bag above.
  const textHelpers: PaymentQueueColumnTextHelpers = {
    employeeNameById,
    paymentStatusFor,
    approvedOnFor,
    commentValueFor: (claim) => comments[claim.id] ?? claim.comments ?? "",
  };

  function runExport(scope: PaymentQueueExportScope) {
    // Generation is synchronous and fast; the busy flag keeps the popover
    // actions disabled while a workbook is being produced.
    setExporting(true);
    try {
      buildAndDownloadXlsx(scope === "full" ? claims : rows, textHelpers, scope);
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }

  // Download the selected claim's summary PDF from the server; failures
  // surface in the table's error banner and never save a partial file.
  async function downloadSummary() {
    if (!selected || downloadingSummary) return;
    setDownloadingSummary(true);
    setActionError(null);
    try {
      const error = await downloadClaimSummary(selected.id, `${selected.ref}-summary.pdf`);
      if (error) setActionError(error);
    } finally {
      setDownloadingSummary(false);
    }
  }

  function sortHeader(column: PaymentQueueColumn) {
    const sortKey = column.sortKey;
    if (!sortKey) return null;
    return (
      <th
        key={column.id}
        aria-sort={sort.key === sortKey ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        className={column.headerClassName ?? "px-4 py-3 font-medium"}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 font-medium hover:text-foreground",
            sort.key === sortKey && "text-foreground",
          )}
        >
          {column.label}
          <ArrowUpDown className={cn("h-3 w-3", sort.key === sortKey && "text-foreground")} />
        </button>
      </th>
    );
  }

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

        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" loading={exporting}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div role="group" aria-label="Export payment queue" className="grid gap-0.5">
              <button
                type="button"
                disabled={rows.length === 0 || exporting}
                onClick={() => runExport("current")}
                className={exportOptionClassName}
              >
                Export current view
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => runExport("full")}
                className={exportOptionClassName}
              >
                Export full queue
              </button>
            </div>
          </PopoverContent>
        </Popover>
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
                <span aria-hidden="true" className="text-muted-foreground">–</span>
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
                <span aria-hidden="true" className="text-muted-foreground">–</span>
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

      <div className="flex w-full items-start gap-4 xl:gap-6">
        <aside
          ref={panelRef}
          tabIndex={-1}
          aria-hidden={!selected}
          inert={!selected}
          aria-label={selected ? `Receipt preview for ${selected.ref}` : "Receipt preview"}
          onKeyDown={handlePanelKeyDown}
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex flex-col bg-card shadow-2xl transition-all duration-300 ease-in-out border-r border-border w-full sm:w-[480px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
            "lg:static lg:z-auto lg:h-[70vh] lg:shadow-none lg:rounded-xl lg:border lg:border-border",
            selected
              ? "translate-x-0 opacity-100 lg:w-[420px] xl:w-[460px] lg:shrink-0"
              : "-translate-x-full opacity-0 pointer-events-none lg:translate-x-0 lg:w-0 lg:p-0 lg:border-0 lg:overflow-hidden lg:shrink-0"
          )}
        >
          {selected ? (
            selectedHasReceipt ? (
              <ReceiptPreview
                claimId={selected.id}
                fileName={selected.attachment?.fileName ? `${selected.ref} - ${selected.attachment.fileName}` : selected.ref}
                onClose={closePanel}
                headerAction={
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    loading={downloadingSummary}
                    onClick={downloadSummary}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download summary
                  </Button>
                }
                className="h-full flex-1 border-0 rounded-none lg:rounded-xl bg-card"
              />
            ) : (
              <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
                  <p className="font-mono text-sm font-medium text-foreground">{selected.ref}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      loading={downloadingSummary}
                      onClick={downloadSummary}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download summary
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Close preview" onClick={closePanel}>
                      <X />
                    </Button>
                  </div>
                </div>
                <div className="m-auto flex items-center justify-center p-6 text-sm text-muted-foreground">
                  No receipt attached to this claim.
                </div>
              </div>
            )
          ) : null}
        </aside>

        <div className="min-w-0 flex-1 transition-all duration-300 ease-in-out">
          {actionError ? (
            <p role="status" className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {actionError}
            </p>
          ) : null}
          <div
            tabIndex={selectedClaimId ? 0 : undefined}
            aria-label={selectedClaimId ? "Payment queue, arrow keys move selection" : undefined}
            onKeyDown={selectedClaimId ? handleTableKeyDown : undefined}
            className="max-h-[70vh] overflow-auto rounded-xl border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
          <table className="w-full min-w-[1600px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-background text-left shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.1)]">
                {PAYMENT_QUEUE_COLUMNS.map((column) =>
                  column.sortKey ? (
                    sortHeader(column)
                  ) : (
                    <th key={column.id} className={column.headerClassName ?? "px-4 py-3 font-medium"}>
                      {column.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={12}>
                    No claims match your search.
                  </td>
                </tr>
              ) : (
                // react-hooks/refs cannot see that the column helpers only
                // touch refs inside deferred ref callbacks and event
                // handlers (never during render), so it flags passing the
                // helpers bag into the schema renderers.
                // eslint-disable-next-line react-hooks/refs
                rows.map((claim) => (
                  <tr
                    key={claim.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(claim.id, el);
                      else rowRefs.current.delete(claim.id);
                    }}
                    className="border-t border-black/10 odd:bg-muted/60"
                  >
                    {PAYMENT_QUEUE_COLUMNS.map((column) => (
                      <td key={column.id} className={column.cellClassName ?? "px-4 py-3"}>
                        {column.render(claim, columnHelpers)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
