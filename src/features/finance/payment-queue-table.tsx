"use client";
// Searchable, filterable, sortable payment queue table for Finance.
// Sortable by reference, category, submission date, amount, and status;
// filterable by awaiting-payment/paid, category, amount range, and submitted date range.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpDown, BadgeCheck, Download, Landmark, Receipt, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { downloadClaimSummary } from "@/lib/download-claim-summary";
import { formatMoney } from "@/features/dashboard/journey-meta";
import type { BankDetails, ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";
import type { BulkPayReport, PaymentRegisterImportReport } from "@/server/expenses/commands";
import { isTerminalPoolEligible } from "@/features/dashboard/next-action";
import { ReceiptPreview } from "@/features/receipts/receipt-preview";
import { ExpenseDrawer } from "@/features/dashboard/expense-drawer";
import { claimToExpense } from "@/features/dashboard/expense-read-model";
import type { Expense } from "@/features/dashboard/mock-data";
import {
  hasReceiptAttachment,
  isSelectionAllSelected,
  selectedClaimFor,
  stepSelection,
  toggleAllSelection,
  toggleClaimSelection,
} from "./payment-queue-selection";
import {
  approvedOnFor,
  filterAndSortPaymentQueue,
  paymentStatusFor,
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
import {
  buildAndDownloadPaymentRegister,
  buildPaymentRegister,
} from "./payment-register-export";
import { PaymentQueueDroppableTable } from "./payment-queue-droppable-table";

const exportOptionClassName =
  "flex w-full items-center justify-start rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

// The row's own interactive controls must never double-fire a container-level
// keyboard or click action; shared by the row-click and keydown handlers.
const ROW_INTERACTIVE_SELECTOR = "button, input, textarea, select";

// The client-side view of a register import outcome: a server rejection
// message, or the row-level report the server parsed from the file.
type RegisterImportFeedback =
  | { kind: "error"; message: string }
  | { kind: "report"; matchedCount: number; conflictCount: number; unknownCount: number };

function importReportMessage(report: Extract<RegisterImportFeedback, { kind: "report" }>): string {
  const parts: string[] = [];
  parts.push(`${report.matchedCount} matching claim${report.matchedCount === 1 ? "" : "s"} selected`);
  if (report.conflictCount > 0) {
    parts.push(`${report.conflictCount} conflict${report.conflictCount === 1 ? "" : "s"}`);
  }
  if (report.unknownCount > 0) {
    parts.push(`${report.unknownCount} unknown id${report.unknownCount === 1 ? "" : "s"}`);
  }
  return parts.join(", ") + ".";
}

export function PaymentQueueTable({
  claims,
  employees = [],
  approvedBankDetails = [],
  currentUser,
  currentUserId,
  currentUserRoleId,
  currentUserRoleCode,
}: {
  claims: ExpenseClaim[];
  employees?: ExpenseEmployee[];
  /** Approved bank details per employee, read server-side under the finance gate (ADR-0024); the payment-register export excludes claims without them. */
  approvedBankDetails?: Array<{ employeeId: string; details: BankDetails }>;
  /** Viewer display name; ExpenseDrawer's next-action/delegate copy addresses the viewer by it. */
  currentUser?: string;
  /** Viewer id; the terminal-stage pool gate uses it to exclude self-claims. */
  currentUserId?: string;
  /** Viewer role id; the terminal-stage pool gate compares it against the claim's current step role. */
  currentUserRoleId?: string;
  /** Viewer role code; ExpenseDrawer's delegation eligibility check uses it. */
  currentUserRoleCode?: string;
}) {
  const employeeNameById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.name])),
    [employees],
  );
  const approvedBankDetailsByEmployee = useMemo(
    () => new Map(approvedBankDetails.map((entry) => [entry.employeeId, entry.details])),
    [approvedBankDetails],
  );
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentFor, setSavingCommentFor] = useState<string | null>(null);
  const [actingClaimId, setActingClaimId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  // Pay the claim straight from the queue: the queue renders only verified
  // claims (ADR-0023), so the only terminal action is payment. Any active
  // reviewer holding the terminal step's role may pay, mirroring the
  // server's requireTerminalPoolClaim (which checks the claim's terminal
  // step). Success refreshes the queue so the row's state comes back from
  // the server.
  async function runTerminalAction(claim: ExpenseClaim) {
    if (actingClaimId) return;
    setActingClaimId(claim.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/expenses/${claim.id}/pay`, { method: "POST" });
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
  // queue: verified claims are payable by any active reviewer holding the
  // terminal step's role, mirroring the server's requireTerminalPoolClaim
  // (which checks the claim's terminal step). Unverified claims never reach
  // the queue, so verify happens from the expense drawer instead.
  const terminalActionFor = (claim: ExpenseClaim): "pay" | null => {
    if (claim.status !== "in-finance") return null;
    const terminalStep = claim.steps[claim.steps.length - 1];
    if (!terminalStep || terminalStep.status !== "verified") {
      return null;
    }
    if (!isTerminalPoolEligible(claim, currentUserId, currentUserRoleId)) return null;
    return "pay";
  };

  // Inline comment save is an input autosave flow on blur/Enter with no discrete trigger Button control;
  // the inline input spinner in payment-queue-columns.tsx is retained and the shared Button loading pattern does not apply.
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

  // The drawer's open/close state is independent of the receipt panel's
  // (ADR-0014): opening one never opens or closes the other.
  const [drawerExpense, setDrawerExpense] = useState<Expense | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openDrawer(claim: ExpenseClaim) {
    setDrawerExpense(claimToExpense(claim, employees));
    setDrawerOpen(true);
  }

  // Row click opens the drawer, but a click inside one of the row's own
  // interactive controls (receipt preview trigger, terminal action button,
  // comment input) must not also open it.
  function handleRowClick(claim: ExpenseClaim, event: React.MouseEvent<HTMLTableRowElement>) {
    if ((event.target as HTMLElement).closest(ROW_INTERACTIVE_SELECTOR)) return;
    openDrawer(claim);
  }

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
  const [sort, setSort] = useState<{ key: PaymentQueueSortKey; dir: 1 | -1 }>({ key: "submitted", dir: -1 });
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadingSummary, setDownloadingSummary] = useState(false);
  // The batch multi-select (ADR-0023): finance cherry-picks verified claims
  // for the payment register export. The set survives filtering - a row
  // hidden by a filter stays part of the batch.
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [registerFeedback, setRegisterFeedback] = useState<string | null>(null);
  // The drag-back import (ADR-0023): the register file is parsed on the
  // server and the matching claims come back for auto-selection; this state
  // renders the row-level report (matched, conflicts, unknown ids).
  const [registerImporting, setRegisterImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<RegisterImportFeedback | null>(null);
  const registerFileInputRef = useRef<HTMLInputElement>(null);
  // The bulk payment run (ADR-0023): an explicit confirmation dialog gates
  // the request, and the result report surfaces skipped rows afterward.
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [bulkPaying, setBulkPaying] = useState(false);
  const [bulkPayResult, setBulkPayResult] = useState<BulkPayReport | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const selectedClaims = useMemo(
    () => claims.filter((claim) => selectedClaimIds.has(claim.id)),
    [claims, selectedClaimIds],
  );

  const selectedTotalMinor = useMemo(
    () => selectedClaims.reduce((sum, claim) => sum + claim.amountMinor, 0),
    [selectedClaims],
  );

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
        filter: "All",
        sortKey: sort.key,
        sortDir: sort.dir,
        categories: categories.length > 0 ? categories : undefined,
        amountMin: amountMin !== "" ? Number(amountMin) : undefined,
        amountMax: amountMax !== "" ? Number(amountMax) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [claims, query, sort, categories, amountMin, amountMax, dateFrom, dateTo],
  );

  // Defined after the rows memo above: react-hooks/preserve-manual-memoization
  // flags a hoisted handler that reads a value declared later in the body.
  function handleTableKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    // Keys inside the row's own interactive controls (comment inputs,
    // receipt preview trigger, terminal action button) do their own thing;
    // never hijack them.
    if ((event.target as HTMLElement).closest(ROW_INTERACTIVE_SELECTOR)) return;
    // The selected row opens the drawer on Enter, matching the row click
    // (the drawer is the only surface with the journey, delegate, and
    // download-summary actions, so it must be keyboard-reachable).
    if (event.key === "Enter") {
      event.preventDefault();
      const claim = rows.find((candidate) => candidate.id === selectedClaimId);
      if (claim) openDrawer(claim);
      return;
    }
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

  // The select-all checkbox shows the tri-state of the visible rows: all
  // selected, some, or none. The indeterminate visual is a DOM property, so
  // it is applied after render rather than via JSX attributes.
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedClaimIds.size > 0 &&
      !isSelectionAllSelected(selectedClaimIds, rows.map((claim) => claim.id));
  }, [selectedClaimIds, rows]);

  // Export the batch selection as the payment register (ADR-0023): one row
  // per selected claim with an approved account. Claims without approved
  // bank details are excluded and reported; when nothing remains the file
  // is never downloaded and the feedback says why.
  function runRegisterExport() {
    if (selectedClaimIds.size === 0) return;
    setExporting(true);
    setRegisterFeedback(null);
    try {
      const selectedClaims = claims.filter((claim) => selectedClaimIds.has(claim.id));
      const { rows: registerRows, excluded } = buildPaymentRegister(
        selectedClaims,
        approvedBankDetailsByEmployee,
        employeeNameById,
      );
      if (registerRows.length === 0) {
        setRegisterFeedback(
          "None of the selected claims can be exported: they have no approved bank details yet. Approve bank details on the profiles page first.",
        );
        return;
      }
      buildAndDownloadPaymentRegister(registerRows);
      if (excluded.length > 0) {
        setRegisterFeedback(
          `${excluded.length} selected claim${excluded.length === 1 ? "" : "s"} ${excluded.length === 1 ? "was" : "were"} skipped: approved bank details are missing, so ${excluded.length === 1 ? "it" : "they"} cannot be paid yet.`,
        );
      } else {
        setRegisterFeedback(`Payment register exported for ${registerRows.length} claim${registerRows.length === 1 ? "" : "s"}.`);
      }
    } finally {
      setExporting(false);
    }
  }

  // The drag-back import (ADR-0023): the register file goes to the
  // protected server route (parsing never happens in the browser), and the
  // matched claims become the selection so finance can review them before
  // paying. The report tells finance what the file contained: matched
  // claims (auto-selected), conflicts (already paid or no longer verified),
  // and unknown expense ids.
  async function importRegister(file: File) {
    if (registerImporting) return;
    setRegisterImporting(true);
    setImportFeedback(null);
    setBulkPayResult(null);
    try {
      const form = new FormData();
      form.set("register", file);
      const response = await fetch("/api/finance/payment-register/import", {
        method: "POST",
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setImportFeedback({
          kind: "error",
          message:
            (body as { message?: string } | null)?.message ??
            "The register could not be imported. Try again.",
        });
        return;
      }
      const report = (body as { report?: PaymentRegisterImportReport }).report;
      if (!report) {
        setImportFeedback({ kind: "error", message: "The server returned an unexpected response." });
        return;
      }
      setSelectedClaimIds(new Set(report.matched.map((claim) => claim.id)));
      setImportFeedback({
        kind: "report",
        matchedCount: report.matched.length,
        conflictCount: report.conflicts.length,
        unknownCount: report.unknownIds.length,
      });
    } catch {
      setImportFeedback({
        kind: "error",
        message: "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setRegisterImporting(false);
    }
  }

  function handleRegisterDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void importRegister(file);
  }

  // The bulk payment run (ADR-0023): the selection - however it was
  // assembled (register import or cherry-picking) - is validated again at
  // execution, eligible claims are paid with their own history events, and
  // skipped rows come back in the report. Paid claims drop out of the
  // selection so a retry only covers what is still open.
  async function runBulkPay() {
    if (bulkPaying || selectedClaimIds.size === 0) return;
    setBulkPaying(true);
    setBulkPayResult(null);
    setActionError(null);
    try {
      const response = await fetch("/api/finance/payment-register/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: Array.from(selectedClaimIds) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(
          (body as { message?: string } | null)?.message ??
            "The payment run could not be completed. Try again.",
        );
        return;
      }
      const report = (body as { report?: BulkPayReport }).report;
      if (!report) {
        setActionError("The server returned an unexpected response.");
        return;
      }
      setBulkPayResult(report);
      const paidIds = new Set(report.paid.map((claim) => claim.id));
      setSelectedClaimIds((current) => new Set([...current].filter((id) => !paidIds.has(id))));
      setPayDialogOpen(false);
      // The queue is server-rendered: refresh so paid claims leave the
      // verified-only list and the row states come back from the store.
      router.refresh();
    } catch {
      setActionError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBulkPaying(false);
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

  function bulkPayClaimLabelFor(claimId: string): string {
    const claim = claims.find((candidate) => candidate.id === claimId);
    return claim ? claim.ref : claimId;
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
      {/* The drag-back import surface (ADR-0023): the exported register can
          be dropped here or chosen through the keyboard-reachable file input
          (the label alternative mirrors the receipt flow's pattern). The
          bytes go to the server; nothing is parsed in the browser. */}
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleRegisterDrop}
        className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Drag the payment register Excel here to re-select its claims, or
        </span>
        <input
          ref={registerFileInputRef}
          id="payment-register-file-input"
          type="file"
          accept=".xlsx"
          className="peer sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importRegister(file);
            // Reset so picking the same file again fires a change event.
            event.target.value = "";
          }}
        />
        <label
          htmlFor="payment-register-file-input"
          className="cursor-pointer font-medium text-primary underline decoration-primary/40 underline-offset-4 peer-focus-visible:rounded peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
        >
          choose a file
        </label>
        {registerImporting ? <span aria-hidden="true">Importing…</span> : null}
      </div>

      {importFeedback ? (
        importFeedback.kind === "error" ? (
          <p
            role="status"
            className="mb-4 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {importFeedback.message}
          </p>
        ) : (
          <p
            role="status"
            className="mb-4 max-w-3xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
          >
            {importReportMessage(importFeedback)}
          </p>
        )
      ) : null}

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

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          loading={exporting}
          disabled={selectedClaimIds.size === 0}
          onClick={runRegisterExport}
        >
          <Download className="h-3.5 w-3.5" />
          Export payment register
        </Button>

        {/* The bulk payment run (ADR-0023): available for any selection -
            the register import is only a convenience for building it - and
            always gated behind the explicit confirmation dialog. */}
        <Button
          size="sm"
          className="gap-1.5"
          disabled={selectedClaimIds.size === 0}
          onClick={() => setPayDialogOpen(true)}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          Mark selected paid
        </Button>
      </div>

      {registerFeedback ? (
        <p role="status" className="mb-4 max-w-3xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
          {registerFeedback}
        </p>
      ) : null}

      {bulkPayResult ? (
        <div
          role="status"
          className="mb-4 max-w-3xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
        >
          <p>
            {bulkPayResult.paid.length} claim{bulkPayResult.paid.length === 1 ? "" : "s"} marked paid
            {bulkPayResult.skipped.length > 0
              ? `, ${bulkPayResult.skipped.length} skipped`
              : ""}
            .
          </p>
          {bulkPayResult.skipped.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {bulkPayResult.skipped.map((skipped) => (
                <li key={skipped.claimId}>
                  {bulkPayClaimLabelFor(skipped.claimId)} - {skipped.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
          <PaymentQueueDroppableTable
            onFileDrop={(file) => void importRegister(file)}
            isImporting={registerImporting}
            onKeyDown={handleTableKeyDown}
            ariaLabel="Payment queue, arrow keys move selection, Enter opens claim details"
          >
            <table className="w-full min-w-[1600px] border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-background text-left shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.1)]">
                  <th className="w-12 px-4 py-3">
                    <label className="sr-only" htmlFor="payment-queue-select-all">
                      Select all claims
                    </label>
                    <input
                      id="payment-queue-select-all"
                      type="checkbox"
                      ref={selectAllRef}
                      checked={isSelectionAllSelected(
                        selectedClaimIds,
                        rows.map((claim) => claim.id),
                      )}
                      onChange={() =>
                        setSelectedClaimIds((current) =>
                          toggleAllSelection(
                            current,
                            rows.map((claim) => claim.id),
                          ),
                        )
                      }
                      className="size-4 accent-primary"
                    />
                  </th>
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
                    <td className="px-4 py-6 text-muted-foreground" colSpan={13}>
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
                      onClick={(event) => handleRowClick(claim, event)}
                      className="cursor-pointer border-t border-black/10 odd:bg-muted/60 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`payment-queue-select-${claim.id}`}>
                          Select {claim.ref}
                        </label>
                        <input
                          id={`payment-queue-select-${claim.id}`}
                          type="checkbox"
                          checked={selectedClaimIds.has(claim.id)}
                          onChange={() =>
                            setSelectedClaimIds((current) => toggleClaimSelection(current, claim.id))
                          }
                          className="size-4 accent-primary"
                        />
                      </td>
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
          </PaymentQueueDroppableTable>
        </div>
      </div>

      <ExpenseDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        expense={drawerExpense}
        currentUser={currentUser ?? ""}
        currentUserId={currentUserId}
        currentUserRoleId={currentUserRoleId}
        currentUserRoleCode={currentUserRoleCode}
      />

      {/* The explicit bulk-pay confirmation (ADR-0023): shows a quick
          verification preview with total payout amount, itemized claims, payees,
          and bank accounts before executing payment. */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>
                  Verify and mark {selectedClaims.length} claim{selectedClaims.length === 1 ? "" : "s"} as paid
                </DialogTitle>
                <DialogDescription>
                  Review the itemized amounts and payee bank details before confirming bulk payout.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Prominent Total Summary Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Payout Amount
              </p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
                {formatMoney(
                  selectedTotalMinor / 100,
                  selectedClaims[0]?.currency ?? "INR",
                )}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {selectedClaims.length} {selectedClaims.length === 1 ? "claim" : "claims"} selected
              </span>
              <span className="text-[11px] text-muted-foreground">
                Final verification before payout
              </span>
            </div>
          </div>

          {/* Quick Itemized Preview Breakdown */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
            <div
              tabIndex={0}
              role="region"
              aria-label="Selected claims payout breakdown"
              className="max-h-60 overflow-y-auto"
            >
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-border bg-card shadow-xs">
                  <tr className="text-muted-foreground">
                    <th scope="col" className="px-3.5 py-2.5 font-semibold">Claim</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold">Payee</th>
                    <th scope="col" className="px-3.5 py-2.5 font-semibold">Bank / Account</th>
                    <th scope="col" className="px-3.5 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {selectedClaims.map((claim) => {
                    const bank = approvedBankDetailsByEmployee.get(claim.requesterId);
                    const payeeName = employeeNameById.get(claim.requesterId) ?? "-";
                    return (
                      <tr key={claim.id} className="hover:bg-muted/30">
                        <td className="px-3.5 py-2.5">
                          <p className="max-w-[180px] truncate font-medium text-foreground" title={claim.title}>
                            {claim.title}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">{claim.ref}</p>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-foreground">
                          {payeeName}
                        </td>
                        <td className="px-3.5 py-2.5 text-muted-foreground">
                          {bank ? (
                            <span className="inline-flex items-center gap-1">
                              <Landmark className="h-3 w-3 shrink-0 text-primary/70" />
                              <span
                                className="max-w-[140px] truncate"
                                title={`${bank.bankName || "Bank"} (${bank.accountNumber})`}
                              >
                                {bank.bankName || "Bank"} ••{bank.accountNumber ? bank.accountNumber.slice(-4) : "••••"}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              No bank details
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                          {formatMoney(claim.amountMinor / 100, claim.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Every selected claim is validated at execution. Rows missing approved bank details or already paid are skipped and reported in the completion summary.
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-2">
            <Button variant="outline" disabled={bulkPaying} onClick={() => setPayDialogOpen(false)}>
              Cancel
            </Button>
            <Button loading={bulkPaying} onClick={runBulkPay}>
              Confirm payment ({formatMoney(selectedTotalMinor / 100, selectedClaims[0]?.currency ?? "INR")})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
