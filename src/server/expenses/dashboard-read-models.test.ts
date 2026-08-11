import { describe, expect, it } from "vitest";
import {
  approverAggregates,
  createDashboardReadModels,
  dashboardViewForRole,
  employeeAggregates,
  financeAggregates,
  inPeriod,
  parseDashboardPeriod,
  periodLabel,
  periodPrefix,
} from "./dashboard-read-models";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseClaim, ExpenseEmployee, ExpenseStep, ExpenseStepStatus } from "./ports";

// The default privilege catalog (ADR-0015): submit-only except Manager
// +approve and Finance +finance access.
const SUBMIT_ONLY = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  canHold: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const ROLE_EXECUTIVE = { id: "role-executive", code: "executive", displayName: "Executive", capabilities: { ...SUBMIT_ONLY } };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager", capabilities: { ...SUBMIT_ONLY, canApprove: true } };
const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true } };
const ROLE_SUPERADMIN = { id: "role-superadmin", code: "superadmin", displayName: "Superadmin" };

const NOW = new Date("2026-08-11T12:00:00.000Z");

const step = (status: ExpenseStepStatus = "pending", roleId: string | null = "role-executive"): ExpenseStep => ({
  id: `step-${Math.random().toString(36).slice(2)}`,
  roleId,
  status,
});

// A two-stage claim: the first step is the pending approval stage, the last
// is the terminal finance stage - so the pending stage is never terminal.
function claim(overrides: Partial<ExpenseClaim>): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    organizationId: "org-1",
    requesterId: "emp-other",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 10000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "in-approval",
    currentActorId: "emp-approver",
    currentStageSince: "2026-08-04T09:00:00.000Z",
    steps: [step("pending", "role-manager"), step("pending", "role-finance-head")],
    history: [],
    version: 1,
    createdAt: "2026-08-04T09:00:00.000Z",
    submittedAt: "2026-08-04T09:00:00.000Z",
    ...overrides,
  };
}

const employee: ExpenseEmployee = {
  id: "emp-approver",
  organizationId: "org-1",
  name: "Sanil Davis",
  role: ROLE_MANAGER,
  active: true,
  managerId: null,
};

describe("parseDashboardPeriod", () => {
  it("defaults to month for absent, empty, or unknown values", () => {
    expect(parseDashboardPeriod(undefined)).toBe("month");
    expect(parseDashboardPeriod(null)).toBe("month");
    expect(parseDashboardPeriod("")).toBe("month");
    expect(parseDashboardPeriod("decade")).toBe("month");
  });

  it("passes the three supported periods through", () => {
    expect(parseDashboardPeriod("month")).toBe("month");
    expect(parseDashboardPeriod("year")).toBe("year");
    expect(parseDashboardPeriod("overall")).toBe("overall");
  });
});

describe("period helpers", () => {
  it("derives the ISO prefix for month and year and none for overall", () => {
    expect(periodPrefix("month", NOW)).toBe("2026-08");
    expect(periodPrefix("year", NOW)).toBe("2026");
    expect(periodPrefix("overall", NOW)).toBeNull();
  });

  it("buckets ISO timestamps by period on the UTC prefix", () => {
    expect(inPeriod("2026-08-04T09:00:00Z", "month", NOW)).toBe(true);
    expect(inPeriod("2026-07-31T23:59:59Z", "month", NOW)).toBe(false);
    expect(inPeriod("2026-02-10T09:00:00Z", "year", NOW)).toBe(true);
    expect(inPeriod("2025-12-31T09:00:00Z", "year", NOW)).toBe(false);
    expect(inPeriod("2019-01-01T00:00:00Z", "overall", NOW)).toBe(true);
  });

  it("labels periods in lowercase for card copy", () => {
    expect(periodLabel("month")).toBe("this month");
    expect(periodLabel("year")).toBe("this year");
    expect(periodLabel("overall")).toBe("overall");
  });
});

describe("dashboardViewForRole", () => {
  it("gives finance roles the finance view", () => {
    expect(dashboardViewForRole(ROLE_FINANCE_HEAD)).toBe("finance");
  });

  it("gives approver-capable roles the approver view", () => {
    expect(dashboardViewForRole(ROLE_MANAGER)).toBe("approver");
  });

  it("gives everyone else the employee view", () => {
    expect(dashboardViewForRole(ROLE_EXECUTIVE)).toBe("employee");
    expect(dashboardViewForRole(null)).toBe("employee");
    expect(dashboardViewForRole(undefined)).toBe("employee");
  });

  it("gives the built-in Superadmin the finance view", () => {
    expect(dashboardViewForRole(ROLE_SUPERADMIN)).toBe("finance");
  });

  it("gives a custom role with both privileges the finance view", () => {
    const dual = { ...ROLE_MANAGER, capabilities: { ...SUBMIT_ONLY, canApprove: true, canAccessFinance: true } };
    expect(dashboardViewForRole(dual)).toBe("finance");
  });
});

describe("employeeAggregates", () => {
  it("sums the viewer's own in-period non-draft spend and counts it", () => {
    const list = [
      claim({ id: "c1", requesterId: "emp-approver", status: "in-approval", amountMinor: 1000 }),
      claim({ id: "c2", requesterId: "emp-approver", status: "draft", amountMinor: 5000 }),
      claim({ id: "c3", requesterId: "emp-approver", status: "rejected", amountMinor: 600 }),
      claim({ id: "c4", requesterId: "emp-other", status: "in-approval", amountMinor: 9999 }),
    ];
    expect(employeeAggregates(list, "emp-approver", "month", NOW)).toEqual({
      spentMinor: 1600,
      spentCount: 2,
      pendingMinor: 1000,
      pendingCount: 1,
      draftsCount: 1,
      reimbursedMinor: 0,
      reimbursedCount: 0,
    });
  });

  it("buckets spend and reimbursements to the selected period", () => {
    const list = [
      claim({ id: "c1", requesterId: "emp-approver", status: "paid", amountMinor: 750, submittedAt: "2026-08-01T09:00:00Z" }),
      claim({ id: "c2", requesterId: "emp-approver", status: "paid", amountMinor: 500, submittedAt: "2026-07-28T09:00:00Z" }),
      claim({ id: "c3", requesterId: "emp-approver", status: "in-approval", amountMinor: 300, submittedAt: "2026-07-28T09:00:00Z" }),
    ];
    expect(employeeAggregates(list, "emp-approver", "month", NOW)).toMatchObject({
      spentMinor: 750,
      spentCount: 1,
      reimbursedMinor: 750,
      reimbursedCount: 1,
    });
    expect(employeeAggregates(list, "emp-approver", "year", NOW)).toMatchObject({
      spentMinor: 1550,
      spentCount: 3,
      reimbursedMinor: 1250,
      reimbursedCount: 2,
    });
    expect(employeeAggregates(list, "emp-approver", "overall", NOW)).toMatchObject({
      spentMinor: 1550,
      spentCount: 3,
    });
  });

  it("never counts another employee's claims as the viewer's money", () => {
    const list = [
      claim({ id: "mine", requesterId: "emp-approver", status: "in-finance", amountMinor: 1000 }),
      claim({ id: "pool", requesterId: "emp-other", status: "in-finance", amountMinor: 19990 }),
    ];
    expect(employeeAggregates(list, "emp-approver", "month", NOW)).toMatchObject({
      spentMinor: 1000,
      spentCount: 1,
    });
  });

  it("treats held claims as paused: not pending, still spent", () => {
    const list = [
      claim({ id: "a", requesterId: "emp-approver", status: "in-approval", heldAt: "2026-08-05T09:00:00Z" }),
      claim({ id: "b", requesterId: "emp-approver", status: "in-finance", heldAt: "2026-08-05T09:00:00Z" }),
    ];
    const stats = employeeAggregates(list, "emp-approver", "month", NOW);
    expect(stats.pendingCount).toBe(0);
    expect(stats.pendingMinor).toBe(0);
    expect(stats.spentCount).toBe(2);
  });
});

describe("approverAggregates", () => {
  it("counts claims whose current actor is the viewer, excluding held claims", () => {
    const list = [
      claim({ id: "c1", status: "in-approval", currentActorId: "emp-approver", amountMinor: 12000 }),
      claim({ id: "c2", status: "in-finance", currentActorId: "emp-approver", amountMinor: 8000 }),
      claim({ id: "c3", status: "in-approval", currentActorId: "emp-approver", heldAt: "2026-08-05T09:00:00Z" }),
      claim({ id: "c4", status: "in-approval", currentActorId: "emp-other", amountMinor: 5000 }),
      claim({ id: "c5", status: "paid", currentActorId: "emp-approver", amountMinor: 7000 }),
    ];
    const stats = approverAggregates(list, "emp-approver", 3, NOW);
    expect(stats.awaitingMyActionCount).toBe(2);
    expect(stats.awaitingMyActionTotalMinor).toBe(20000);
  });

  it("counts holds I started and holds sitting on my stage (delegation edge)", () => {
    const list = [
      // Held by me but delegated onward: the hold is mine even though the
      // stage moved on (ADR-0017).
      claim({ id: "delegated", heldAt: "2026-08-06T09:00:00Z", heldBy: "emp-approver", currentActorId: "emp-other" }),
      // On my stage, held by someone before the delegation re-pointed it.
      claim({ id: "on-stage", heldAt: "2026-08-07T09:00:00Z", heldBy: "emp-old-actor", currentActorId: "emp-approver" }),
      // Someone else's hold elsewhere.
      claim({ id: "elsewhere", heldAt: "2026-08-08T09:00:00Z", heldBy: "emp-other", currentActorId: "emp-other2" }),
    ];
    const stats = approverAggregates(list, "emp-approver", 3, NOW);
    expect(stats.myHoldsCount).toBe(2);
    // Newest hold first.
    expect(stats.holdClaimIds).toEqual(["on-stage", "delegated"]);
  });

  it("ages only the viewer's stage claims past the timeout at a non-terminal stage", () => {
    const list = [
      // Stuck at my non-terminal stage beyond the 3-day timeout.
      claim({ id: "aged", status: "in-approval", currentActorId: "emp-approver", currentStageSince: "2026-08-01T09:00:00Z" }),
      // Within the timeout.
      claim({ id: "fresh", status: "in-approval", currentActorId: "emp-approver", currentStageSince: "2026-08-09T09:00:00Z" }),
      // On my stage but held: the hold outranks the timeout (ADR-0016).
      claim({ id: "held", status: "in-approval", currentActorId: "emp-approver", heldAt: "2026-08-05T09:00:00Z", currentStageSince: "2026-08-01T09:00:00Z" }),
      // Another actor's stale claim is not mine to chase.
      claim({ id: "other", status: "in-approval", currentActorId: "emp-other", currentStageSince: "2026-08-01T09:00:00Z" }),
      // A stale terminal stage is never auto-skipped (absence-skip.ts).
      claim({
        id: "terminal",
        status: "in-finance",
        currentActorId: "emp-approver",
        currentStageSince: "2026-08-01T09:00:00Z",
        steps: [step("approved", "role-manager"), step("pending", "role-finance-head")],
      }),
    ];
    const stats = approverAggregates(list, "emp-approver", 3, NOW);
    expect(stats.agedCount).toBe(1);
    expect(stats.agedClaimIds).toEqual(["aged"]);
  });

  it("sorts aged claims most overdue first", () => {
    const list = [
      claim({ id: "less-stuck", currentActorId: "emp-approver", currentStageSince: "2026-08-05T09:00:00Z" }),
      claim({ id: "most-stuck", currentActorId: "emp-approver", currentStageSince: "2026-07-20T09:00:00Z" }),
      claim({ id: "mid-stuck", currentActorId: "emp-approver", currentStageSince: "2026-07-30T09:00:00Z" }),
    ];
    expect(approverAggregates(list, "emp-approver", 3, NOW).agedClaimIds).toEqual([
      "most-stuck",
      "mid-stuck",
      "less-stuck",
    ]);
  });
});

describe("financeAggregates", () => {
  it("counts the verification/payment backlog, excluding held claims", () => {
    const list = [
      claim({ id: "q1", status: "in-finance", amountMinor: 12000 }),
      claim({ id: "q2", status: "in-finance", amountMinor: 8000, steps: [step("approved"), step("verified")] }),
      claim({ id: "held", status: "in-finance", heldAt: "2026-08-05T09:00:00Z", amountMinor: 5000 }),
      claim({ id: "draft", status: "draft", amountMinor: 3000 }),
      claim({ id: "paid", status: "paid", amountMinor: 9000 }),
      claim({ id: "rejected", status: "rejected", amountMinor: 2000 }),
    ];
    const stats = financeAggregates(list, 3, "month", NOW);
    expect(stats.queueCount).toBe(2);
    expect(stats.queueTotalMinor).toBe(20000);
  });

  it("buckets paid out and rejected by the selected period", () => {
    const list = [
      claim({ id: "paid-aug", status: "paid", amountMinor: 7500, submittedAt: "2026-08-01T09:00:00Z" }),
      claim({ id: "paid-jul", status: "paid", amountMinor: 5000, submittedAt: "2026-07-28T09:00:00Z" }),
      claim({ id: "rej-aug", status: "rejected", amountMinor: 600, submittedAt: "2026-08-02T09:00:00Z" }),
      claim({ id: "rej-jul", status: "rejected", amountMinor: 900, submittedAt: "2026-07-10T09:00:00Z" }),
    ];
    const stats = financeAggregates(list, 3, "month", NOW);
    expect(stats.paidOutMinor).toBe(7500);
    expect(stats.paidOutCount).toBe(1);
    expect(stats.rejectedCount).toBe(1);
    expect(stats.rejectedTotalMinor).toBe(600);
    const yearly = financeAggregates(list, 3, "year", NOW);
    expect(yearly.paidOutMinor).toBe(12500);
    expect(yearly.rejectedCount).toBe(2);
  });

  it("ages org-wide stale claims regardless of the current actor", () => {
    const list = [
      claim({ id: "mine", currentActorId: "emp-approver", currentStageSince: "2026-08-01T09:00:00Z" }),
      claim({ id: "theirs", currentActorId: "emp-other", currentStageSince: "2026-07-15T09:00:00Z" }),
      claim({ id: "terminal", status: "in-finance", currentActorId: "emp-other", currentStageSince: "2026-07-15T09:00:00Z", steps: [step("approved"), step("pending", "role-finance-head")] }),
    ];
    const stats = financeAggregates(list, 3, "month", NOW);
    expect(stats.agedCount).toBe(2);
    // Most overdue first: theirs sat since July 15, mine since August 1.
    expect(stats.agedClaimIds).toEqual(["theirs", "mine"]);
  });
});

describe("createDashboardReadModels.cards", () => {
  it("sources the employee view from the viewer's workspace claims", async () => {
    const store = new InMemoryExpenseStore({
      employees: [employee],
    });
    const readModels = createDashboardReadModels({
      store,
      absenceTimeout: { getAbsenceTimeoutDays: async () => 3 },
    });
    const result = await readModels.cards("employee", "month", NOW, employee);
    expect(result.cards).toEqual({ view: "employee", employee: expect.any(Object) });
    expect(result.absenceTimeoutDays).toBe(3);
  });

  it("sources the approver and finance views from the organization's claims", async () => {
    const orgClaim = claim({ id: "org-wide" });
    const readModels = createDashboardReadModels({
      store: {
        listClaimsForEmployee: async () => [],
        listClaimsForOrganization: async () => [orgClaim],
      },
      absenceTimeout: { getAbsenceTimeoutDays: async () => 3 },
    });
    const approver = await readModels.cards("approver", "month", NOW, employee);
    expect(approver.cards).toMatchObject({
      view: "approver",
      approver: { awaitingMyActionCount: 1 },
    });
    const finance = await readModels.cards("finance", "month", NOW, employee);
    expect(finance.cards).toMatchObject({ view: "finance" });
  });

  it("resolves the configured absence timeout through the seam", async () => {
    const readModels = createDashboardReadModels({
      store: {
        listClaimsForEmployee: async () => [],
        listClaimsForOrganization: async () => [],
      },
      absenceTimeout: { getAbsenceTimeoutDays: async () => 7 },
    });
    const result = await readModels.cards("finance", "month", NOW, employee);
    expect(result.absenceTimeoutDays).toBe(7);
  });
});
