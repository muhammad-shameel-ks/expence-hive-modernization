// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpenseDashboard } from "./dashboard";
import type { Expense } from "./mock-data";
import type { DashboardCards } from "@/server/expenses/dashboard-read-models";

const mockRefresh = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: mockReplace }),
  usePathname: () => "/expenses",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  mockRefresh.mockClear();
  mockReplace.mockClear();
  document.cookie = "eh_dashboard_period=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

const NOW_ISO = new Date().toISOString();

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "ex-1",
    ref: "EXP-2026-0001",
    title: "Client dinner",
    category: "Meals",
    amount: 120,
    currency: "INR",
    date: "Aug 1",
    submittedAt: NOW_ISO,
    status: "submitted",
    requesterId: "emp-user",
    attachments: [],
    history: [],
    ...overrides,
  };
}

const EMPLOYEE_CARDS: DashboardCards = {
  view: "employee",
  employee: {
    spentMinor: 12000,
    spentCount: 1,
    pendingMinor: 24000,
    pendingCount: 2,
    draftsCount: 1,
    reimbursedMinor: 5000,
    reimbursedCount: 1,
  },
};

const APPROVER_CARDS: DashboardCards = {
  view: "approver",
  approver: {
    awaitingMyActionCount: 2,
    awaitingMyActionTotalMinor: 36000,
    agedCount: 1,
    agedClaimIds: ["ex-aged"],
  },
};

const FINANCE_CARDS: DashboardCards = {
  view: "finance",
  finance: {
    queueCount: 3,
    queueTotalMinor: 90000,
    paidOutMinor: 60000,
    paidOutCount: 2,
    agedCount: 1,
    agedClaimIds: ["ex-aged"],
    rejectedCount: 1,
    rejectedTotalMinor: 8000,
  },
};

function renderDashboard(cards: DashboardCards, expenses: Expense[], role: { roleId?: string; roleCode?: string } = {}) {
  return render(
    <ExpenseDashboard
      currentUser="Sanil Davis"
      currentUserId="emp-user"
      currentUserRoleId={role.roleId ?? "role-manager"}
      currentUserRoleCode={role.roleCode ?? "manager"}
      cards={cards}
      absenceTimeoutDays={3}
      period="month"
      expenses={expenses}
      activity={[]}
    />,
  );
}

describe("ExpenseDashboard card grids", () => {
  it("renders the employee card set with a drafts CTA", () => {
    renderDashboard(EMPLOYEE_CARDS, []);
    expect(screen.getByText("Spent this month")).toBeInTheDocument();
    expect(screen.getByText("Pending reimbursements")).toBeInTheDocument();
    expect(screen.getByText("Drafts")).toBeInTheDocument();
    expect(screen.getByText("Reimbursed this month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume draft" })).toBeInTheDocument();
  });

  it("renders the approver card set with an aging CTA", () => {
    renderDashboard(APPROVER_CARDS, []);
    expect(screen.getByText("Awaiting my action")).toBeInTheDocument();
    expect(screen.getByText("Aging")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review oldest" })).toBeInTheDocument();
    expect(screen.queryByText("Spent this month")).not.toBeInTheDocument();
  });

  it("renders the finance card set with a queue link", () => {
    renderDashboard(FINANCE_CARDS, []);
    expect(screen.getByText("Queue backlog")).toBeInTheDocument();
    expect(screen.getByText("Paid out this month")).toBeInTheDocument();
    expect(screen.getByText("Aged claims")).toBeInTheDocument();
    expect(screen.getByText("Rejected this month")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open queue" })).toHaveAttribute("href", "/finance/payments");
  });

  it("shows empty-state hints and drops CTAs when a card has nothing", () => {
    renderDashboard(
      {
        view: "employee",
        employee: {
          spentMinor: 0,
          spentCount: 0,
          pendingMinor: 0,
          pendingCount: 0,
          draftsCount: 0,
          reimbursedMinor: 0,
          reimbursedCount: 0,
        },
      },
      [],
    );
    expect(screen.getByText("Nothing spent this month")).toBeInTheDocument();
    expect(screen.getByText("Nothing awaiting payment")).toBeInTheDocument();
    expect(screen.getByText("No drafts yet - submit a new claim")).toBeInTheDocument();
    expect(screen.getByText("Nothing reimbursed this month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume draft" })).not.toBeInTheDocument();
  });
});

describe("ExpenseDashboard period switch", () => {
  it("renders the switch with the active period pressed", () => {
    renderDashboard(EMPLOYEE_CARDS, []);
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Overall" })).toHaveAttribute("aria-pressed", "false");
  });

  it("persists a switch to the cookie and refreshes", () => {
    renderDashboard(EMPLOYEE_CARDS, []);
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    expect(document.cookie).toContain("eh_dashboard_period=year");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("ExpenseDashboard role-adaptive layouts (ADR-0027)", () => {
  // A claim assigned to the viewer for a decision: it must surface in the
  // "needs your attention" card.
  const decision = () =>
    expense({
      id: "ex-decision",
      title: "Decision needed",
      status: "in-approval",
      requesterId: "emp-other",
      nextActorId: "emp-user",
    });

  const headingIndex = (label: string) =>
    screen.getAllByRole("heading").findIndex((heading) => heading.textContent?.startsWith(label));

  it("leads with the expense list for employees and shows no attention panel when empty", () => {
    renderDashboard(EMPLOYEE_CARDS, [], { roleCode: "executive" });
    expect(screen.getByRole("heading", { name: "Your Expense" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Needs your attention" })).not.toBeInTheDocument();
  });

  it("shows the employee attention card only when it has items, after the list", () => {
    renderDashboard(EMPLOYEE_CARDS, [decision()], { roleCode: "executive" });
    expect(headingIndex("Your Expense")).toBeLessThan(headingIndex("Needs your attention"));
  });

  it("leads with the attention card for approvers, with the expense list below", () => {
    renderDashboard(APPROVER_CARDS, [decision()], { roleCode: "manager" });
    expect(headingIndex("Needs your attention")).toBeLessThan(headingIndex("Your Expense"));
  });

  it("leads with the attention card for finance roles, with the expense list below", () => {
    renderDashboard(FINANCE_CARDS, [decision()], { roleCode: "finance-executive" });
    expect(headingIndex("Needs your attention")).toBeLessThan(headingIndex("Your Expense"));
  });

  it("never renders an empty attention panel in the approver layout", () => {
    renderDashboard(APPROVER_CARDS, []);
    expect(screen.queryByRole("heading", { name: "Needs your attention" })).not.toBeInTheDocument();
  });

  it("never renders an empty attention panel in the finance layout", () => {
    renderDashboard(FINANCE_CARDS, []);
    expect(screen.queryByRole("heading", { name: "Needs your attention" })).not.toBeInTheDocument();
  });

  it("keeps the admin-first default for superadmin: overview and attention side by side", () => {
    renderDashboard(FINANCE_CARDS, [decision()], { roleCode: "superadmin" });
    expect(headingIndex("Your Expense")).toBeLessThan(headingIndex("Needs your attention"));
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeInTheDocument();
  });

  it("keeps the my-activity feed in every layout", () => {
    renderDashboard(EMPLOYEE_CARDS, [], { roleCode: "executive" });
    expect(screen.getByRole("heading", { name: "My activity" })).toBeInTheDocument();
  });
});

describe("ExpenseDashboard drawer integration", () => {
  it("opens the drawer on the newest draft from the drafts CTA", () => {
    const draft = expense({ id: "ex-draft", title: "Team lunch draft", status: "draft", attachments: [] });
    renderDashboard(EMPLOYEE_CARDS, [draft]);
    fireEvent.click(screen.getByRole("button", { name: "Resume draft" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Team lunch draft");
  });

  it("shows the preview truncated to five and the filtered empty state otherwise", () => {
    const own = (id: string, status: Expense["status"]) =>
      expense({ id, title: `Claim ${id}`, status, attachments: [] });
    renderDashboard(
      EMPLOYEE_CARDS,
      [own("a", "submitted"), own("b", "submitted"), own("c", "submitted"), own("d", "submitted"), own("e", "submitted"), own("f", "submitted")],
    );
    const rows = screen.getAllByRole("button", { name: /Claim [a-f]/ });
    expect(rows).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /^Paid/ }));
    // No paid claims: the filtered view shows the empty state instead of five rows.
    expect(screen.getByText("No claims match your filters")).toBeInTheDocument();
  });

  it("renders the shared filter section on the dashboard list surface (ADR-0021)", () => {
    renderDashboard(EMPLOYEE_CARDS, []);
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Rejected/ })).toBeInTheDocument();
  });

  it("opens the drawer on the oldest aged claim from the aging CTA", () => {
    const aged = expense({
      id: "ex-aged",
      title: "Stuck travel claim",
      status: "in-approval",
    });
    renderDashboard(APPROVER_CARDS, [aged]);
    fireEvent.click(screen.getByRole("button", { name: "Review oldest" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Stuck travel claim");
  });

  it("does nothing when the aging CTA has no aged claim ids", () => {
    const cards: DashboardCards = { view: "approver", approver: { ...APPROVER_CARDS.approver, agedClaimIds: [] } };
    renderDashboard(cards, []);
    fireEvent.click(screen.getByRole("button", { name: "Review oldest" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
