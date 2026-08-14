import {
  Banknote,
  Check,
  Clock,
  MessageSquare,
  PenLine,
  Send,
  ShieldCheck,
  SkipForward,
  StickyNote,
  UserRoundCheck,
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
  "auto-skipped": { label: "Auto-skipped", tone: "muted", icon: SkipForward },
  delegated: { label: "Delegated", tone: "primary", icon: UserRoundCheck },
  reviewing: { label: "Finance review", tone: "primary", icon: ShieldCheck },
  verified: { label: "Finance verified", tone: "primary", icon: ShieldCheck },
  paid: { label: "Paid", tone: "success", icon: Banknote },
  comment: { label: "Comment added", tone: "primary", icon: MessageSquare },
  note: { label: "Note", tone: "muted", icon: StickyNote },
};

export const DEFAULT_KIND_META: { label: string; tone: TimelineTone; icon: LucideIcon } = {
  label: "Activity",
  tone: "muted",
  icon: Clock,
};

export function getKindMeta(kind?: string): { label: string; tone: TimelineTone; icon: LucideIcon } {
  if (!kind) return DEFAULT_KIND_META;
  const meta = KIND_META[kind as HistoryKind];
  if (meta) return meta;
  const formattedLabel = kind
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return {
    label: formattedLabel,
    tone: "muted",
    icon: Clock,
  };
}

export { simplifyAutoSkipDetail } from "@/server/shared/amount-guard";

export interface ActionIndicatorStyle {
  label: string;
  badgeClass: string;
  iconBgClass: string;
  iconColorClass: string;
  borderClass: string;
  calloutBgClass?: string;
}

export const ACTION_INDICATOR_STYLES: Record<HistoryKind, ActionIndicatorStyle> = {
  paid: {
    label: "Paid",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 dark:border-emerald-500/30",
    iconBgClass: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconColorClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-500/20 dark:border-emerald-500/30",
    calloutBgClass: "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200",
  },
  approved: {
    label: "Approved",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 dark:border-emerald-500/30",
    iconBgClass: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconColorClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-500/20 dark:border-emerald-500/30",
    calloutBgClass: "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200",
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 dark:border-rose-500/30",
    iconBgClass: "bg-rose-500/10 dark:bg-rose-500/20",
    iconColorClass: "text-rose-600 dark:text-rose-400",
    borderClass: "border-rose-500/20 dark:border-rose-500/30",
    calloutBgClass: "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/50 text-rose-900 dark:text-rose-200",
  },
  verified: {
    label: "Finance verified",
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 dark:border-indigo-500/30",
    iconBgClass: "bg-indigo-500/10 dark:bg-indigo-500/20",
    iconColorClass: "text-indigo-600 dark:text-indigo-400",
    borderClass: "border-indigo-500/20 dark:border-indigo-500/30",
    calloutBgClass: "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200/80 dark:border-indigo-900/50 text-indigo-900 dark:text-indigo-200",
  },
  reviewing: {
    label: "Finance review",
    badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20 dark:border-indigo-500/30",
    iconBgClass: "bg-indigo-500/10 dark:bg-indigo-500/20",
    iconColorClass: "text-indigo-600 dark:text-indigo-400",
    borderClass: "border-indigo-500/20 dark:border-indigo-500/30",
  },
  submitted: {
    label: "Submitted",
    badgeClass: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 dark:border-sky-500/30",
    iconBgClass: "bg-sky-500/10 dark:bg-sky-500/20",
    iconColorClass: "text-sky-600 dark:text-sky-400",
    borderClass: "border-sky-500/20 dark:border-sky-500/30",
  },
  delegated: {
    label: "Delegated",
    badgeClass: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20 dark:border-amber-500/30",
    iconBgClass: "bg-amber-500/10 dark:bg-amber-500/20",
    iconColorClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-500/20 dark:border-amber-500/30",
  },
  comment: {
    label: "Commented",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 dark:border-blue-500/30",
    iconBgClass: "bg-blue-500/10 dark:bg-blue-500/20",
    iconColorClass: "text-blue-600 dark:text-blue-400",
    borderClass: "border-blue-500/20 dark:border-blue-500/30",
    calloutBgClass: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-900/50 text-blue-900 dark:text-blue-200",
  },
  draft: {
    label: "Draft saved",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBgClass: "bg-muted",
    iconColorClass: "text-muted-foreground",
    borderClass: "border-border",
  },
  skipped: {
    label: "Stage skipped",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBgClass: "bg-muted",
    iconColorClass: "text-muted-foreground",
    borderClass: "border-border",
  },
  "auto-skipped": {
    label: "Auto-skipped",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBgClass: "bg-muted",
    iconColorClass: "text-muted-foreground",
    borderClass: "border-border",
  },
  note: {
    label: "Note",
    badgeClass: "bg-muted text-muted-foreground border-border",
    iconBgClass: "bg-muted",
    iconColorClass: "text-muted-foreground",
    borderClass: "border-border",
  },
};

export const FILTER_DOT_COLOR: Record<string, string> = {
  all: "bg-slate-400",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  verified: "bg-indigo-500",
  paid: "bg-emerald-500",
  delegated: "bg-amber-500",
  comment: "bg-blue-500",
  draft: "bg-slate-400",
  submitted: "bg-sky-500",
  skipped: "bg-slate-400",
  "auto-skipped": "bg-slate-400",
  reviewing: "bg-indigo-500",
  note: "bg-slate-400",
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
