"use client";
// PROTOTYPE — dashboard revamping variations.
// Minimalist + Tastefully Colorful UI UX.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Layers,
  Sparkles,
  Plane,
  Utensils,
  Laptop,
  Briefcase,
  Building,
  Receipt,
  TrendingUp,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Activity,
  CreditCard,
  Search,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardStats } from "./dashboard-stats";
import { ExpenseDrawer } from "./expense-drawer";
import { STATUS_META, type Expense } from "./mock-data";
import { formatMoney, statusBadgeClass, submittedLabel } from "./journey-meta";
import { nextActionFor } from "./next-action";

export type PrototypeVariant = "v1" | "v2" | "v3";

interface PrototypeDashboardProps {
  currentUser: string;
  expenses: Expense[];
  initialVariant?: PrototypeVariant;
}

export function PrototypeDashboard({
  currentUser,
  expenses,
  initialVariant = "v1",
}: PrototypeDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeVariant = (searchParams.get("variant") as PrototypeVariant) || initialVariant;
  const [showMenu, setShowMenu] = useState(true);

  const [selected, setSelected] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);

  const openExpense = (expense: Expense) => {
    setSelected(expense);
    setOpen(true);
  };

  const stats = dashboardStats(expenses, new Date().toISOString().slice(0, 7));

  // Actionable items requiring attention
  const actionableItems = expenses.filter((e) => {
    const next = nextActionFor(e, currentUser);
    return (
      e.status === "needs-correction" ||
      e.status === "in-approval" ||
      e.status === "submitted" ||
      (next && next.mine)
    );
  });

  const recentExpenses = expenses.slice(0, 5);

  const switchVariant = (v: PrototypeVariant) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", v);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative flex flex-col gap-8 pb-28">
      {/* MINIMALIST & COLORFUL STAT CARDS */}
      <section aria-label="Monthly overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {/* Card 1: Spent */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-2xs transition hover:border-border hover:shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Spent this month
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
            {formatMoney(stats.spentThisMonth)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{stats.spentThisMonthCount} {stats.spentThisMonthCount === 1 ? "expense" : "expenses"}</span>
            <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              +12%
            </span>
          </div>
        </div>

        {/* Card 2: Pending Approval */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-2xs transition hover:border-border hover:shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pending Approval
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
            {stats.pendingApproval}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>awaiting decision</span>
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              Active
            </span>
          </div>
        </div>

        {/* Card 3: Needs Correction */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-2xs transition hover:border-border hover:shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Needs Correction
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
            {stats.needsCorrection}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>action required</span>
            <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
              Urgent
            </span>
          </div>
        </div>

        {/* Card 4: Reimbursed */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-2xs transition hover:border-border hover:shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reimbursed
            </p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
            {formatMoney(stats.reimbursedThisMonth)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>payments received</span>
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              100% Paid
            </span>
          </div>
        </div>
      </section>

      {/* Render Active Variant */}
      {activeVariant === "v1" && (
        <Variant1MinimalistBento
          expenses={recentExpenses}
          actionableItems={actionableItems}
          totalCount={expenses.length}
          onOpen={openExpense}
        />
      )}

      {activeVariant === "v2" && (
        <Variant2WorkflowFocus
          expenses={recentExpenses}
          actionableItems={actionableItems}
          totalCount={expenses.length}
          currentUser={currentUser}
          onOpen={openExpense}
        />
      )}

      {activeVariant === "v3" && (
        <Variant3OperationsGrid
          expenses={expenses}
          actionableItems={actionableItems}
          onOpen={openExpense}
        />
      )}

      {/* Expense Detail Drawer */}
      <ExpenseDrawer open={open} onOpenChange={setOpen} expense={selected} currentUser={currentUser} />

      {/* FLOATING PROTOTYPE CONTROLLER BAR & TOGGLE */}
      {showMenu ? (
        <aside
          aria-label="Prototype controls"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 rounded-2xl border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 px-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-4 w-4 text-amber-500" />
              PROTOTYPE VARIANTS
            </span>

            <div className="flex items-center gap-1.5 rounded-xl bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => switchVariant("v1")}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 font-medium transition-all",
                  activeVariant === "v1"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                ✨ V1: Minimalist Bento
              </button>
              <button
                type="button"
                onClick={() => switchVariant("v2")}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 font-medium transition-all",
                  activeVariant === "v2"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                ⚡ V2: Workflow Stream
              </button>
              <button
                type="button"
                onClick={() => switchVariant("v3")}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 font-medium transition-all",
                  activeVariant === "v3"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                🎯 V3: Operations Grid
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowMenu(false)}
              title="Hide prototype menu"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all text-xs font-bold"
            >
              ✕
            </button>
          </div>

          {/* State Telemetry */}
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>Active Route: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">/expenses?variant={activeVariant}</code></span>
            <span>Expenses Loaded: <strong className="text-foreground">{expenses.length}</strong></span>
            <span>Action Required: <strong className="text-foreground">{actionableItems.length}</strong></span>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setShowMenu(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-bold text-foreground shadow-xl backdrop-blur-xl hover:border-primary transition-all"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span>Show Prototype Menu</span>
        </button>
      )}
    </div>
  );
}

/* =========================================================================
   Helper Component: Category Icon Pill (Pastel Minimalist Accent)
   ========================================================================= */
function CategoryIconPill({ category }: { category: string }) {
  const cat = category.toLowerCase();
  let icon = <Receipt className="h-4 w-4" />;
  let colorClass = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";

  if (cat.includes("travel") || cat.includes("flight") || cat.includes("cab")) {
    icon = <Plane className="h-4 w-4" />;
    colorClass = "bg-sky-500/10 text-sky-600 dark:text-sky-400";
  } else if (cat.includes("meal") || cat.includes("food") || cat.includes("dinner")) {
    icon = <Utensils className="h-4 w-4" />;
    colorClass = "bg-orange-500/10 text-orange-600 dark:text-orange-400";
  } else if (cat.includes("software") || cat.includes("saas") || cat.includes("cloud")) {
    icon = <Laptop className="h-4 w-4" />;
    colorClass = "bg-violet-500/10 text-violet-600 dark:text-violet-400";
  } else if (cat.includes("hardware") || cat.includes("equipment")) {
    icon = <Briefcase className="h-4 w-4" />;
    colorClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  } else if (cat.includes("office") || cat.includes("supplies")) {
    icon = <Building className="h-4 w-4" />;
    colorClass = "bg-pink-500/10 text-pink-600 dark:text-pink-400";
  }

  return (
    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition", colorClass)}>
      {icon}
    </div>
  );
}

/* =========================================================================
   Helper Component: Mini Stage Progress Dots
   ========================================================================= */
function StageProgressBar({ status }: { status: string }) {
  let step = 1;
  if (status === "approved" || status === "in-finance") step = 2;
  if (status === "paid") step = 3;

  return (
    <div className="flex items-center gap-1">
      <div className={cn("h-1.5 w-3 rounded-full transition-all", step >= 1 ? "bg-primary" : "bg-muted")} />
      <div className={cn("h-1.5 w-3 rounded-full transition-all", step >= 2 ? "bg-primary" : "bg-muted")} />
      <div className={cn("h-1.5 w-3 rounded-full transition-all", step >= 3 ? "bg-emerald-500" : "bg-muted")} />
    </div>
  );
}

/* =========================================================================
   VARIANT 1: Ultra Minimalist Bento Grid with Single Search Input
   ========================================================================= */
function Variant1MinimalistBento({
  expenses,
  actionableItems,
  totalCount,
  onOpen,
}: {
  expenses: Expense[];
  actionableItems: Expense[];
  totalCount: number;
  onOpen: (e: Expense) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = expenses.filter(
    (e) =>
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.category.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Bento Card — Recent Expenses (65% = 8 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-8">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Recent Expenses</h2>

            {/* SINGLE COMPACT SEARCH COMPONENT */}
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search expenses..."
                className="h-8.5 w-full rounded-lg border border-border/60 bg-background pl-8.5 pr-3 text-xs outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="mt-3 divide-y divide-border/30">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No expenses matching "{query}"
              </div>
            ) : (
              filtered.map((expense) => (
                <div
                  key={expense.id}
                  onClick={() => onOpen(expense)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(expense)}
                  className="group flex cursor-pointer items-center justify-between py-3 px-2 rounded-lg transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-3.5">
                    <CategoryIconPill category={expense.category} />
                    <div>
                      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition">
                        {expense.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{expense.date}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {formatMoney(expense.amount, expense.currency)}
                    </span>
                    <AnimatedBadge
                      status={STATUS_META[expense.status].tone}
                      className={statusBadgeClass(expense.status)}
                    >
                      {STATUS_META[expense.status].label}
                    </AnimatedBadge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="ghost" className="w-full justify-between text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary" asChild>
            <a href="/expenses/all">
              View all expenses directory ({totalCount})
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Right Bento Card — Action Inbox (35% = 4 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-4">
        <div>
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Action Inbox</h2>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              {actionableItems.length} pending
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Items requiring your review, approval, or correction.
          </p>

          <div className="mt-5 space-y-2.5">
            {actionableItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-semibold text-foreground">All clear!</p>
                <p className="text-xs text-muted-foreground">No pending approvals or corrections.</p>
              </div>
            ) : (
              actionableItems.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onOpen(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
                  className="group flex cursor-pointer flex-col gap-1.5 rounded-xl border border-l-2 border-border border-l-amber-500 bg-background/60 p-3 transition hover:border-amber-500/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                      {item.title}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      {formatMoney(item.amount, item.currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.category}</span>
                    <AnimatedBadge
                      status={STATUS_META[item.status].tone}
                      className={statusBadgeClass(item.status)}
                    >
                      {STATUS_META[item.status].label}
                    </AnimatedBadge>
                  </div>

                  {item.blockingReason && (
                    <p className="mt-0.5 rounded bg-amber-500/10 p-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      ⚠️ {item.blockingReason}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground" asChild>
            <a href="/expenses/all">
              Manage all in inbox
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

/* =========================================================================
   VARIANT 2: Workflow Activity Stream
   ========================================================================= */
function Variant2WorkflowFocus({
  expenses,
  actionableItems,
  totalCount,
  currentUser,
  onOpen,
}: {
  expenses: Expense[];
  actionableItems: Expense[];
  totalCount: number;
  currentUser: string;
  onOpen: (e: Expense) => void;
}) {
  const [tab, setTab] = useState<"action" | "mine">("action");

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Card — Workflow Stream (60% = 7 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-7">
        <div>
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Workflow Activity Stream</h2>
              <p className="text-xs text-muted-foreground">Real-time stage tracking across active requests.</p>
            </div>
            <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
              Workflow Active
            </span>
          </div>

          <div className="mt-5 space-y-2.5">
            {expenses.map((expense) => {
              const next = nextActionFor(expense, currentUser);
              return (
                <div
                  key={expense.id}
                  onClick={() => onOpen(expense)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(expense)}
                  className="group cursor-pointer rounded-xl border border-border/40 bg-background/50 p-3.5 transition hover:border-border hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <CategoryIconPill category={expense.category} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-sm group-hover:text-primary transition">
                            {expense.title}
                          </span>
                          {expense.permission && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
                              {expense.permission}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {expense.category} · {submittedLabel(expense.submittedAt)}
                        </p>
                      </div>
                    </div>

                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {formatMoney(expense.amount, expense.currency)}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Activity className="h-3.5 w-3.5 text-violet-500" />
                      {next ? `Stage: ${next.label}` : "Completed"}
                    </span>
                    <AnimatedBadge
                      status={STATUS_META[expense.status].tone}
                      className={statusBadgeClass(expense.status)}
                    >
                      {STATUS_META[expense.status].label}
                    </AnimatedBadge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="ghost" className="w-full justify-between text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary" asChild>
            <a href="/expenses/all">
              Go to Full Expenses Directory ({totalCount})
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Right Card — Tabbed Approvals Feed (40% = 5 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-5">
        <div>
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Approvals & Inbox</h2>

            {/* Interactive Clean Tabs */}
            <div className="flex items-center gap-1 rounded-xl bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setTab("action")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-semibold transition-all",
                  tab === "action"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Action ({actionableItems.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("mine")}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-semibold transition-all",
                  tab === "mine"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                My Claims
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {(tab === "action" ? actionableItems : expenses).map((item) => (
              <div
                key={item.id}
                onClick={() => onOpen(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
                className="group cursor-pointer rounded-xl border border-border/40 bg-background/50 p-3 transition hover:border-border hover:bg-muted/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{item.title}</span>
                  <span className="text-xs font-bold tabular-nums text-foreground">
                    {formatMoney(item.amount, item.currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.category}</span>
                  <AnimatedBadge status={STATUS_META[item.status].tone} className={statusBadgeClass(item.status)}>
                    {STATUS_META[item.status].label}
                  </AnimatedBadge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="outline" size="sm" className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground" asChild>
            <a href="/expenses/all">Open Full Inbox Directory</a>
          </Button>
        </div>
      </section>
    </div>
  );
}

/* =========================================================================
   VARIANT 3: Compact Operations Grid
   ========================================================================= */
function Variant3OperationsGrid({
  expenses,
  actionableItems,
  onOpen,
}: {
  expenses: Expense[];
  actionableItems: Expense[];
  onOpen: (e: Expense) => void;
}) {
  const inProgress = expenses.filter((e) => e.status !== "paid" && e.status !== "rejected");
  const completed = expenses.filter((e) => e.status === "paid" || e.status === "rejected");

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Card — Split Open vs Completed Claims (65% = 8 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-8">
        <div>
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Operations Digest</h2>
              <p className="text-xs text-muted-foreground">Clear visual distinction between active money flows and settled claims.</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Live Sync
            </span>
          </div>

          <div className="mt-5 space-y-5">
            {/* In-Flight Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2.5">
                In-Flight Claims ({inProgress.length})
              </h3>

              <div className="space-y-2">
                {inProgress.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpen(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3 hover:border-border transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIconPill category={item.category} />
                      <div>
                        <p className="font-bold text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.category} · {item.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold tabular-nums text-foreground">
                        {formatMoney(item.amount, item.currency)}
                      </span>
                      <AnimatedBadge status={STATUS_META[item.status].tone} className={statusBadgeClass(item.status)}>
                        {STATUS_META[item.status].label}
                      </AnimatedBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Finalized Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2.5">
                Recently Finalized ({completed.length})
              </h3>

              <div className="space-y-2">
                {completed.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpen(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-border/40 bg-background/50 p-3 hover:border-border transition-all text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryIconPill category={item.category} />
                      <div>
                        <p className="font-bold text-foreground">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground">{item.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold tabular-nums text-foreground">
                        {formatMoney(item.amount, item.currency)}
                      </span>
                      <AnimatedBadge status={STATUS_META[item.status].tone} className={statusBadgeClass(item.status)}>
                        {STATUS_META[item.status].label}
                      </AnimatedBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="ghost" className="w-full justify-between text-xs font-semibold text-primary hover:bg-primary/5 hover:text-primary" asChild>
            <a href="/expenses/all">
              Go to Full Expenses Directory
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Right Card — Operations Alert Center (35% = 4 cols) */}
      <section className="flex flex-col justify-between rounded-2xl border border-border/60 bg-card p-6 shadow-2xs lg:col-span-4">
        <div>
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <ShieldAlert className="h-4 w-4 text-rose-500" />
            <h2 className="text-lg font-bold tracking-tight text-foreground">Alert & Policy Center</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Direct attention flags and policy review notices.</p>

          <div className="mt-5 space-y-2.5">
            {actionableItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpen(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onOpen(item)}
                className="group cursor-pointer rounded-xl border border-l-2 border-border border-l-rose-500 bg-background/60 p-3 transition hover:border-rose-500/60"
              >
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span>{item.title}</span>
                  <span className="tabular-nums">{formatMoney(item.amount, item.currency)}</span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {item.blockingReason || "Requires action or manager review."}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <Button variant="outline" size="sm" className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground" asChild>
            <a href="/expenses/all">View All Policy Flags</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
