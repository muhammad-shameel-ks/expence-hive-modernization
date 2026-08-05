import type { ExpenseClaim } from "@/server/expenses/ports";

export type PaymentQueueFilter = "All" | "Awaiting payment" | "Paid";
export type PaymentQueueSortKey = "submitted" | "ref" | "category" | "amount" | "status";

export interface PaymentQueueQuery {
  query?: string;
  filter?: PaymentQueueFilter;
  categories?: string[];
  amountMin?: number;
  amountMax?: number;
  /** ISO date (yyyy-mm-dd) bounds on submittedAt, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  sortKey?: PaymentQueueSortKey;
  sortDir?: 1 | -1;
}

const FILTER_MATCH: Record<Exclude<PaymentQueueFilter, "All">, (claim: ExpenseClaim) => boolean> = {
  "Awaiting payment": (claim) => claim.status === "in-finance",
  Paid: (claim) => claim.status === "paid",
};

export function filterAndSortPaymentQueue(claims: ExpenseClaim[], options: PaymentQueueQuery = {}): ExpenseClaim[] {
  const {
    query = "",
    filter = "All",
    categories,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    sortKey = "submitted",
    sortDir = -1,
  } = options;
  const q = query.trim().toLowerCase();

  let list = claims;
  if (filter !== "All") list = list.filter(FILTER_MATCH[filter]);
  if (categories && categories.length > 0) list = list.filter((claim) => categories.includes(claim.category));
  if (amountMin !== undefined) list = list.filter((claim) => claim.amountMinor / 100 >= amountMin);
  if (amountMax !== undefined) list = list.filter((claim) => claim.amountMinor / 100 <= amountMax);
  if (dateFrom) list = list.filter((claim) => (claim.submittedAt ?? claim.createdAt).slice(0, 10) >= dateFrom);
  if (dateTo) list = list.filter((claim) => (claim.submittedAt ?? claim.createdAt).slice(0, 10) <= dateTo);
  if (q) {
    list = list.filter(
      (claim) =>
        claim.title.toLowerCase().includes(q) ||
        claim.ref.toLowerCase().includes(q) ||
        claim.category.toLowerCase().includes(q) ||
        (claim.subCategory ?? "").toLowerCase().includes(q) ||
        (claim.remark ?? "").toLowerCase().includes(q),
    );
  }

  return [...list].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortKey === "amount") {
      av = a.amountMinor;
      bv = b.amountMinor;
    } else if (sortKey === "ref") {
      av = a.ref.toLowerCase();
      bv = b.ref.toLowerCase();
    } else if (sortKey === "category") {
      av = a.category.toLowerCase();
      bv = b.category.toLowerCase();
    } else if (sortKey === "status") {
      av = a.status;
      bv = b.status;
    } else {
      av = a.submittedAt ?? a.createdAt;
      bv = b.submittedAt ?? b.createdAt;
    }
    if (av === bv) return a.id.localeCompare(b.id);
    return av > bv ? sortDir : -sortDir;
  });
}

export type PaymentStatus = "Paid" | "Not Paid";

export function paymentStatusFor(claim: ExpenseClaim): PaymentStatus {
  return claim.status === "paid" ? "Paid" : "Not Paid";
}

export function approvedOnFor(claim: ExpenseClaim): string | undefined {
  const approvals = claim.history.filter((event) => event.kind === "approved");
  return approvals.length > 0 ? approvals[approvals.length - 1].createdAt : undefined;
}
