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
    myHoldsCount: 1,
    holdClaimIds: ["ex-held"],
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

function renderDashboard(cards: DashboardCards, expenses: Expense[]) {
  return render(
    <ExpenseDashboard
      currentUser="Sanil Davis"
      currentUserId="emp-user"
      currentUserRoleId="role-manager"
      currentUserRoleCode="manager"
      currentUserCanHold
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

  it("renders the approver card set with hold and aging CTAs", () => {
    renderDashboard(APPROVER_CARDS, []);
    expect(screen.getByText("Awaiting my action")).toBeInTheDocument();
    expect(screen.getByText("My holds")).toBeInTheDocument();
    expect(screen.getByText("Aging")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume a hold" })).toBeInTheDocument();
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

  it("opens the drawer on the held claim from the holds CTA", () => {
    const held = expense({
      id: "ex-held",
      title: "Held travel claim",
      status: "in-approval",
      held: { by: "Sanil Davis", at: "2026-08-05T09:00:00Z", reason: "Awaiting docs" },
    });
    renderDashboard(APPROVER_CARDS, [held]);
    fireEvent.click(screen.getByRole("button", { name: "Resume a hold" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Held travel claim");
  });

  it("does nothing when the hold CTA has no held claim ids", () => {
    const cards: DashboardCards = { view: "approver", approver: { ...APPROVER_CARDS.approver, holdClaimIds: [] } };
    renderDashboard(cards, []);
    fireEvent.click(screen.getByRole("button", { name: "Resume a hold" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
