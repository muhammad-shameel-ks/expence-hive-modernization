import {
  Banknote,
  Check,
  Gavel,
  MessageSquare,
  PenLine,
  Send,
  ShieldCheck,
  SkipForward,
  StickyNote,
  X,
  type LucideIcon,
} from "lucide-react";
import type { TimelineTone } from "@/components/motion/timeline";
import type { ExpenseStatus, HistoryKind } from "./mock-data";

export const KIND_META: Record<HistoryKind, { label: string; tone: TimelineTone; icon: LucideIcon }> = {
  draft: { label: "Draft saved", tone: "muted", icon: PenLine },
  submitted: { label: "Submitted", tone: "info", icon: Send },
  approved: { label: "Approved", tone: "success", icon: Check },
  rejected: { label: "Rejected", tone: "danger", icon: X },
  skipped: { label: "Stage skipped", tone: "muted", icon: SkipForward },
  takeover: { label: "Taken over", tone: "primary", icon: Gavel },
  reviewing: { label: "Finance review", tone: "primary", icon: ShieldCheck },
  verified: { label: "Finance verified", tone: "primary", icon: ShieldCheck },
  paid: { label: "Paid", tone: "success", icon: Banknote },
  comment: { label: "Comment added", tone: "primary", icon: MessageSquare },
  note: { label: "Note", tone: "muted", icon: StickyNote },
};

export function statusBadgeClass(status: ExpenseStatus) {
  if (status === "in-finance") {
    return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400";
  }
  if (status === "submitted" || status === "in-approval") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
  }
  return undefined;
}

export function formatMoney(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** "Aug 3" from an ISO submission timestamp, in UTC so the date never shifts. */
export function submittedLabel(submittedAt: string) {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return submittedAt;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}
