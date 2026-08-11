import type { ReactNode, RefCallback } from "react";
import { AlertTriangle, FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExpenseClaim } from "@/server/expenses/ports";
import { approvedOnFor, paymentStatusFor, rejectionFor, type PaymentQueueSortKey } from "./payment-queue-query";
import { hasReceiptAttachment } from "./payment-queue-selection";

export type PaymentQueueColumnId =
  | "name"
  | "reference"
  | "category"
  | "subCategory"
  | "billSubmission"
  | "billInvoiceDate"
  | "amount"
  | "status"
  | "paymentStatus"
  | "approvedOn"
  | "remark"
  | "comments";

/**
 * Everything a column renderer may need beyond the claim itself. The table
 * builds one instance per render; the Excel export will supply its own.
 */
export interface PaymentQueueColumnHelpers {
  employeeNameById: ReadonlyMap<string, string>;
  paymentStatusFor: typeof paymentStatusFor;
  approvedOnFor: typeof approvedOnFor;
  hasReceiptAttachment: typeof hasReceiptAttachment;
  rowSelectedFor: (claimId: string) => boolean;
  previewButtonRefFor: (claimId: string) => RefCallback<HTMLButtonElement>;
  onToggleReceiptPreview: (claimId: string) => void;
  actingClaimId: string | null;
  terminalActionFor: (claim: ExpenseClaim) => "verify" | "pay" | null;
  onTerminalAction: (claim: ExpenseClaim) => void;
  commentValueFor: (claim: ExpenseClaim) => string;
  savingCommentFor: string | null;
  onSaveComment: (claimId: string, value: string) => void;
}

/**
 * The subset of column helpers the plain-text export accessors need. The
 * render helpers bag carries DOM concerns (refs, event handlers, loading
 * state); the export only ever produces strings and numbers, so it gets a
 * narrower bag instead.
 */
export interface PaymentQueueColumnTextHelpers {
  employeeNameById: ReadonlyMap<string, string>;
  paymentStatusFor: typeof paymentStatusFor;
  approvedOnFor: typeof approvedOnFor;
  commentValueFor: (claim: ExpenseClaim) => string;
}

export interface PaymentQueueColumn {
  id: PaymentQueueColumnId;
  label: string;
  sortKey?: PaymentQueueSortKey;
  headerClassName?: string;
  cellClassName?: string;
  render: (claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) => ReactNode;
  /**
   * Plain-text export accessor mirroring the cell the renderer shows
   * (ADR-0010). Numbers stay numbers so Excel gets a numeric amount.
   */
  textValue: (claim: ExpenseClaim, helpers: PaymentQueueColumnTextHelpers) => string | number;
}

function renderName(claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) {
  const rowSelected = helpers.rowSelectedFor(claim.id);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {helpers.hasReceiptAttachment(claim) ? (
        <Button
          ref={helpers.previewButtonRefFor(claim.id)}
          variant={rowSelected ? "default" : "outline"}
          size="icon-sm"
          aria-label={`Preview receipt for ${claim.ref}`}
          aria-expanded={rowSelected}
          onClick={() => helpers.onToggleReceiptPreview(claim.id)}
          className="shrink-0"
        >
          <FileText />
        </Button>
      ) : null}
      <span className="truncate">{helpers.employeeNameById.get(claim.requesterId) ?? "-"}</span>
    </div>
  );
}

function renderReference(claim: ExpenseClaim) {
  return (
    <>
      <p className="font-medium text-foreground">{claim.title}</p>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{claim.ref}</p>
    </>
  );
}

function renderPaymentStatus(claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) {
  const paymentStatus = helpers.paymentStatusFor(claim);
  const terminalAction = helpers.terminalActionFor(claim);
  return (
    <>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          paymentStatus === "Rejected"
            ? "bg-red-500/15 text-red-700 dark:text-red-400"
            : paymentStatus === "Paid"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : paymentStatus === "Held"
                ? "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        )}
      >
        {paymentStatus}
      </span>
      {terminalAction ? (
        <Button
          size="sm"
          variant={terminalAction === "pay" ? "default" : "outline"}
          loading={helpers.actingClaimId === claim.id}
          disabled={helpers.actingClaimId !== null}
          onClick={() => helpers.onTerminalAction(claim)}
        >
          {terminalAction === "pay" ? "Mark paid" : "Verify for payment"}
        </Button>
      ) : null}
    </>
  );
}

function renderApprovedOn(claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) {
  const approvedOn = helpers.approvedOnFor(claim);
  return approvedOn ? approvedOn.slice(0, 10) : "-";
}

function renderRejection(claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) {
  const rejection = rejectionFor(claim);
  if (!rejection) return <span className="text-muted-foreground">-</span>;
  const actorName = helpers.employeeNameById.get(rejection.actorId ?? "") ?? "-";
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-2.5 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium leading-snug text-foreground">{rejection.detail ?? "Rejected"}</p>
        <p className="mt-0.5 text-muted-foreground">
          Rejected by {actorName} on {rejection.createdAt.slice(0, 10)}
        </p>
      </div>
    </div>
  );
}

function renderComments(claim: ExpenseClaim, helpers: PaymentQueueColumnHelpers) {
  // Rejected claims are a frozen record (ADR-0009): the reason renders
  // read-only from history, and the comment editor never appears.
  if (claim.status === "rejected") return renderRejection(claim, helpers);
  const commentValue = helpers.commentValueFor(claim);
  const saving = helpers.savingCommentFor === claim.id;
  return (
    <div className="relative">
      <input
        type="text"
        defaultValue={commentValue}
        placeholder="Add a comment…"
        aria-label={`Comment for ${claim.ref}`}
        aria-busy={saving || undefined}
        disabled={saving}
        onBlur={(e) => {
          if (e.target.value !== commentValue) helpers.onSaveComment(claim.id, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        // The trailing slot is always reserved so the
        // text gutter never shifts while a save is
        // pending; the spinner appears inside the fixed
        // slot instead of changing the input's padding.
        className="h-8 w-full rounded-md border border-input bg-card pl-2 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {/*
       * The shared Button `loading` prop is not used here because there is no
       * discrete save trigger to attach it to: the comment save fires on blur/Enter
       * of this plain text input, with no adjacent button. `aria-busy` on the input
       * (above) carries the loading semantics for assistive tech; this spinner is a
       * purely visual affordance layered on top of the input itself.
       */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      >
        {saving ? <LoaderCircle className="animate-spin" /> : null}
      </span>
    </div>
  );
}

// Plain-text counterparts of the renderers above: what a claim contributes
// to the Excel export for each cell. The table never uses these; the export
// module never uses the JSX renderers. Both read the same claim and helpers,
// so a column change has to update render + textValue together, in one place.

function textName(claim: ExpenseClaim, helpers: PaymentQueueColumnTextHelpers) {
  return helpers.employeeNameById.get(claim.requesterId) ?? "-";
}

function textReference(claim: ExpenseClaim) {
  return `${claim.title} (${claim.ref})`;
}

function textApprovedOn(claim: ExpenseClaim, helpers: PaymentQueueColumnTextHelpers) {
  const approvedOn = helpers.approvedOnFor(claim);
  return approvedOn ? approvedOn.slice(0, 10) : "-";
}

function textComments(claim: ExpenseClaim, helpers: PaymentQueueColumnTextHelpers) {
  // Rejected claims are a frozen record (ADR-0009): the export mirrors the
  // Comments cell and surfaces the read-only rejection note, never the
  // claim's comments field.
  if (claim.status === "rejected") {
    const rejection = rejectionFor(claim);
    if (!rejection) return "";
    const actorName = helpers.employeeNameById.get(rejection.actorId ?? "") ?? "-";
    return `${rejection.detail ?? "Rejected"} - Rejected by ${actorName} on ${rejection.createdAt.slice(0, 10)}`;
  }
  return helpers.commentValueFor(claim);
}

/**
 * Single source of truth for the payment queue's columns (ADR-0010): the
 * table renders its thead and row cells from here, and the Excel export will
 * consume the same schema. Class strings are the exact ones the table
 * rendered before the refactor, so output stays byte-for-byte identical.
 */
export const PAYMENT_QUEUE_COLUMNS: readonly PaymentQueueColumn[] = [
  {
    id: "name",
    label: "Name",
    cellClassName: "px-4 py-3 text-foreground",
    render: renderName,
    textValue: textName,
  },
  {
    id: "reference",
    label: "Reference",
    sortKey: "ref",
    render: renderReference,
    textValue: textReference,
  },
  {
    id: "category",
    label: "Category",
    sortKey: "category",
    headerClassName: "px-4 py-3 font-medium hidden md:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground md:table-cell",
    render: (claim) => claim.category,
    textValue: (claim) => claim.category,
  },
  {
    id: "subCategory",
    label: "Sub category",
    headerClassName: "hidden px-4 py-3 font-medium lg:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground lg:table-cell",
    render: (claim) => claim.subCategory || "-",
    textValue: (claim) => claim.subCategory || "-",
  },
  {
    id: "billSubmission",
    label: "Bill submission",
    sortKey: "submitted",
    headerClassName: "px-4 py-3 font-medium hidden sm:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground sm:table-cell",
    render: (claim) => (claim.submittedAt ?? claim.createdAt).slice(0, 10),
    textValue: (claim) => (claim.submittedAt ?? claim.createdAt).slice(0, 10),
  },
  {
    id: "billInvoiceDate",
    label: "Bill invoice date",
    headerClassName: "hidden px-4 py-3 font-medium lg:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground lg:table-cell",
    render: (claim) => claim.expenseDate,
    textValue: (claim) => claim.expenseDate,
  },
  {
    id: "amount",
    label: "Amount",
    sortKey: "amount",
    headerClassName: "px-4 py-3 font-medium text-right",
    cellClassName: "px-4 py-3 text-right font-medium tabular-nums text-foreground",
    render: (claim) => `₹${(claim.amountMinor / 100).toFixed(2)}`,
    // Numeric, not formatted: the export styles it for Excel (INR grouping).
    textValue: (claim) => claim.amountMinor / 100,
  },
  {
    id: "status",
    label: "Status",
    sortKey: "status",
    render: (claim) => claim.status,
    textValue: (claim) => claim.status,
  },
  {
    id: "paymentStatus",
    label: "Payment status",
    render: renderPaymentStatus,
    textValue: (claim, helpers) => helpers.paymentStatusFor(claim),
  },
  {
    id: "approvedOn",
    label: "Approved on",
    headerClassName: "hidden px-4 py-3 font-medium xl:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground xl:table-cell",
    render: renderApprovedOn,
    textValue: textApprovedOn,
  },
  {
    id: "remark",
    label: "Remark",
    headerClassName: "hidden px-4 py-3 font-medium xl:table-cell",
    cellClassName: "hidden px-4 py-3 text-muted-foreground xl:table-cell",
    render: (claim) => claim.remark || "-",
    textValue: (claim) => claim.remark || "-",
  },
  {
    id: "comments",
    label: "Comments",
    headerClassName: "min-w-[220px] px-4 py-3 font-medium",
    render: renderComments,
    textValue: textComments,
  },
];
