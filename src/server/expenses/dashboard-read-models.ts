// Role-scoped dashboard read models (ADR-0020): the /expenses dashboard's
// card aggregates are computed here, server-side, from org-level claim data
// through the existing expense store - never by re-filtering the viewer's
// own workspace list in the client. The module is isomorphic (no node-only
// imports), so the period helpers and view selection below are shared with
// the client components that render the same period semantics.

import { resolveRoleCapabilities, type RoleCapabilitiesRecord } from "../shared/authorization";
import { isStageTimedOut, isTerminalIndex } from "./absence-skip";
import type { AbsenceTimeoutReader } from "./commands";
import type { ExpenseClaim, ExpenseEmployee, ExpenseStore } from "./ports";

/** The dashboard's period control (ADR-0020): month and year are relative to now, overall spans everything. */
export type DashboardPeriod = "month" | "year" | "overall";

/** Which role-adaptive card set the dashboard renders (ADR-0020). */
export type DashboardView = "employee" | "approver" | "finance";

// The persisted period preference lives in a cookie (ADR-0020). The constant
// must live in an isomorphic module: a value imported from a "use client"
// component into a server component becomes a client reference, not a plain
// string, so the server read path could never look the cookie up.
export const DASHBOARD_PERIOD_COOKIE = "eh_dashboard_period";

/** Resolves the viewer's dashboard view from their role capabilities: finance roles get the finance view, approver-capable roles the approver view, everyone else the employee view. Custom roles without finance or approval privileges fall back to the employee view. */
export function dashboardViewForRole(role: RoleCapabilitiesRecord | null | undefined): DashboardView {
  const capabilities = resolveRoleCapabilities(role);
  if (capabilities.canAccessFinance) return "finance";
  if (capabilities.canApprove) return "approver";
  return "employee";
}

/** Parses the persisted period preference; anything unknown falls back to the default month. */
export function parseDashboardPeriod(value: string | undefined | null): DashboardPeriod {
  return value === "month" || value === "year" || value === "overall" ? value : "month";
}

/** "2026-08" for a month, "2026" for a year, null for overall. Periods are bucketed on the UTC ISO string so the server and client never drift on timezones. */
export function periodPrefix(period: DashboardPeriod, now: Date): string | null {
  if (period === "overall") return null;
  const iso = now.toISOString();
  return period === "month" ? iso.slice(0, 7) : iso.slice(0, 4);
}

/** Whether an ISO timestamp falls inside the selected period. */
export function inPeriod(iso: string, period: DashboardPeriod, now: Date): boolean {
  const prefix = periodPrefix(period, now);
  return prefix === null || iso.startsWith(prefix);
}

/** Lowercase display label for the period, e.g. "this month" / "this year" / "overall". */
export function periodLabel(period: DashboardPeriod): string {
  return period === "month" ? "this month" : period === "year" ? "this year" : "overall";
}

export interface EmployeeAggregates {
  /** The viewer's own non-draft spend in the period, minor units. */
  spentMinor: number;
  spentCount: number;
  /** The viewer's own in-flight claims awaiting payment (held claims are paused, ADR-0016). */
  pendingMinor: number;
  pendingCount: number;
  /** The viewer's drafts needing completion. */
  draftsCount: number;
  /** The viewer's paid claims submitted in the period, minor units. */
  reimbursedMinor: number;
  reimbursedCount: number;
}

export interface ApproverAggregates {
  /** In-flight claims whose current actor is the viewer, count + total. */
  awaitingMyActionCount: number;
  awaitingMyActionTotalMinor: number;
  /** Held claims the viewer holds or that sit on the viewer's stage (ADR-0016; delegation re-points the actor without clearing the hold, ADR-0017). */
  myHoldsCount: number;
  /** Held claims, most recently held first - the card opens one in the drawer for quick resume. */
  holdClaimIds: string[];
  /** The viewer's stage claims stuck beyond the configured absence timeout (ADR-0018). */
  agedCount: number;
  /** Aged claims, most overdue first - the card can chase the oldest. */
  agedClaimIds: string[];
}

export interface FinanceAggregates {
  /** In-flight claims at the finance stage awaiting verification or payment (held claims are paused). */
  queueCount: number;
  queueTotalMinor: number;
  /** Claims paid in the period, minor units. */
  paidOutMinor: number;
  paidOutCount: number;
  /** Org-wide in-flight claims stuck beyond the configured absence timeout (ADR-0018). */
  agedCount: number;
  agedClaimIds: string[];
  /** Claims rejected in the period. */
  rejectedCount: number;
  rejectedTotalMinor: number;
}

export type DashboardCards =
  | { view: "employee"; employee: EmployeeAggregates }
  | { view: "approver"; approver: ApproverAggregates }
  | { view: "finance"; finance: FinanceAggregates };

function inFlight(claim: ExpenseClaim): boolean {
  return claim.status === "in-approval" || claim.status === "in-finance";
}

// "Reimbursed"/"paid out" cards count a claim in the period money actually
// moved, not the period it was submitted in (ADR-0020): falls back to
// submittedAt/createdAt only if a paid claim somehow lacks a "paid" event.
function paidAtFor(claim: ExpenseClaim): string {
  const paidEvent = [...claim.history].reverse().find((event) => event.kind === "paid");
  return paidEvent?.createdAt ?? claim.submittedAt ?? claim.createdAt;
}

function pendingIndex(claim: ExpenseClaim): number {
  return claim.steps.findIndex((step) => step.status === "pending");
}

// A claim is "aged" when its current pending stage has waited past the
// configured absence timeout - the same predicate the sweep uses to
// auto-skip, so the aging card and the sweep cannot drift apart
// (ADR-0018/0020). Held claims are exempt (ADR-0016/0018), and the
// terminal stage is never auto-skipped, so neither is ever "aged".
function isAged(claim: ExpenseClaim, absenceTimeoutDays: number, now: Date): boolean {
  if (!inFlight(claim) || claim.heldAt) return false;
  const index = pendingIndex(claim);
  if (index === -1 || isTerminalIndex(claim, index)) return false;
  return isStageTimedOut(claim, absenceTimeoutDays, now);
}

export function employeeAggregates(
  claims: ExpenseClaim[],
  viewerId: string,
  period: DashboardPeriod,
  now: Date,
): EmployeeAggregates {
  let spentMinor = 0;
  let spentCount = 0;
  let pendingMinor = 0;
  let pendingCount = 0;
  let draftsCount = 0;
  let reimbursedMinor = 0;
  let reimbursedCount = 0;
  for (const claim of claims) {
    if (claim.requesterId !== viewerId) continue;
    const submittedAt = claim.submittedAt ?? claim.createdAt;
    if (claim.status === "draft") {
      draftsCount += 1;
    } else {
      if (inPeriod(submittedAt, period, now)) {
        spentMinor += claim.amountMinor;
        spentCount += 1;
      }
      if (claim.status === "paid" && inPeriod(paidAtFor(claim), period, now)) {
        reimbursedMinor += claim.amountMinor;
        reimbursedCount += 1;
      }
    }
    if (inFlight(claim) && !claim.heldAt) {
      pendingMinor += claim.amountMinor;
      pendingCount += 1;
    }
  }
  return {
    spentMinor,
    spentCount,
    pendingMinor,
    pendingCount,
    draftsCount,
    reimbursedMinor,
    reimbursedCount,
  };
}

export function approverAggregates(
  claims: ExpenseClaim[],
  viewerId: string,
  absenceTimeoutDays: number,
  now: Date,
): ApproverAggregates {
  let awaitingMyActionCount = 0;
  let awaitingMyActionTotalMinor = 0;
  let myHoldsCount = 0;
  const holdClaimIds: string[] = [];
  let agedCount = 0;
  const agedClaimIds: string[] = [];
  for (const claim of claims) {
    if (inFlight(claim) && !claim.heldAt && claim.currentActorId === viewerId && pendingIndex(claim) !== -1) {
      awaitingMyActionCount += 1;
      awaitingMyActionTotalMinor += claim.amountMinor;
    }
    // Delegation (ADR-0017) re-points a held claim's actor without clearing
    // the hold, so "mine" is the union of holds I started and holds sitting
    // on my stage.
    if (claim.heldAt && (claim.heldBy === viewerId || claim.currentActorId === viewerId)) {
      myHoldsCount += 1;
      holdClaimIds.push(claim.id);
    }
    if (claim.currentActorId === viewerId && isAged(claim, absenceTimeoutDays, now)) {
      agedCount += 1;
      agedClaimIds.push(claim.id);
    }
  }
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const heldAtOf = (id: string) => claimsById.get(id)?.heldAt ?? "";
  const stageSinceOf = (id: string) => claimsById.get(id)?.currentStageSince ?? "";
  holdClaimIds.sort((a, b) => heldAtOf(b).localeCompare(heldAtOf(a)));
  agedClaimIds.sort((a, b) => stageSinceOf(a).localeCompare(stageSinceOf(b)));
  return {
    awaitingMyActionCount,
    awaitingMyActionTotalMinor,
    myHoldsCount,
    holdClaimIds,
    agedCount,
    agedClaimIds,
  };
}

export function financeAggregates(
  claims: ExpenseClaim[],
  absenceTimeoutDays: number,
  period: DashboardPeriod,
  now: Date,
): FinanceAggregates {
  let queueCount = 0;
  let queueTotalMinor = 0;
  let paidOutMinor = 0;
  let paidOutCount = 0;
  let agedCount = 0;
  const agedClaimIds: string[] = [];
  let rejectedCount = 0;
  let rejectedTotalMinor = 0;
  for (const claim of claims) {
    if (claim.status === "in-finance" && !claim.heldAt) {
      queueCount += 1;
      queueTotalMinor += claim.amountMinor;
    }
    const submittedAt = claim.submittedAt ?? claim.createdAt;
    if (claim.status === "paid" && inPeriod(paidAtFor(claim), period, now)) {
      paidOutMinor += claim.amountMinor;
      paidOutCount += 1;
    }
    if (isAged(claim, absenceTimeoutDays, now)) {
      agedCount += 1;
      agedClaimIds.push(claim.id);
    }
    if (claim.status === "rejected" && inPeriod(submittedAt, period, now)) {
      rejectedCount += 1;
      rejectedTotalMinor += claim.amountMinor;
    }
  }
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const stageSinceOf = (id: string) => claimsById.get(id)?.currentStageSince ?? "";
  agedClaimIds.sort((a, b) => stageSinceOf(a).localeCompare(stageSinceOf(b)));
  return {
    queueCount,
    queueTotalMinor,
    paidOutMinor,
    paidOutCount,
    agedCount,
    agedClaimIds,
    rejectedCount,
    rejectedTotalMinor,
  };
}

export type DashboardReadModelDeps = {
  store: Pick<ExpenseStore, "listClaimsForEmployee" | "listClaimsForOrganization">;
  /** The admin settings seam (ADR-0018): resolves the org's configured absence timeout. */
  absenceTimeout: AbsenceTimeoutReader;
};

export type DashboardReadModelResult = {
  cards: DashboardCards;
  absenceTimeoutDays: number;
};

// The dashboard's server-side read path (ADR-0020): sources the claim data
// each view needs and computes its card aggregates. The caller has already
// authorized the actor and derived the view from their role capabilities
// (dashboardViewForRole); this factory only sources org-level data - the
// approver and finance views read the whole organization through the store,
// the employee view reads the viewer's own workspace claims.
export function createDashboardReadModels({
  store,
  absenceTimeout,
}: DashboardReadModelDeps): {
  cards(
    view: DashboardView,
    period: DashboardPeriod,
    now: Date,
    employee: ExpenseEmployee,
  ): Promise<DashboardReadModelResult>;
} {
  return {
    async cards(view, period, now, employee) {
      const absenceTimeoutDays = await absenceTimeout.getAbsenceTimeoutDays(employee.organizationId);
      let cards: DashboardCards;
      if (view === "employee") {
        cards = {
          view,
          employee: employeeAggregates(await store.listClaimsForEmployee(employee), employee.id, period, now),
        };
      } else if (view === "approver") {
        cards = {
          view,
          approver: approverAggregates(
            await store.listClaimsForOrganization(employee.organizationId),
            employee.id,
            absenceTimeoutDays,
            now,
          ),
        };
      } else {
        cards = {
          view,
          finance: financeAggregates(
            await store.listClaimsForOrganization(employee.organizationId),
            absenceTimeoutDays,
            period,
            now,
          ),
        };
      }
      return { cards, absenceTimeoutDays };
    },
  };
}
