// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgWideExpenseList } from "./org-wide-expense-list";
import type { Expense } from "@/features/dashboard/mock-data";
import type { ExpenseEmployee } from "@/server/expenses/ports";

const mockReplace = vi.fn();
let mockPathname = "/finance/expenses";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    refresh: vi.fn(),
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    ref: "EXP-2026-0001",
    title: "Client dinner",
    category: "Meals",
    amount: 2400,
    currency: "INR",
    date: "Aug 4",
    submittedAt: "2026-08-04T10:42:00Z",
    status: "in-finance",
    requesterId: "emp-ada",
    nextStage: "Finance verification",
    nextActor: "Rishikesh",
    attachments: [],
    history: [],
    ...overrides,
  };
}

const EMPLOYEES: ExpenseEmployee[] = [
  { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: null, active: true, managerId: null },
  { id: "emp-shameel", organizationId: "org-1", name: "Muhammad Shameel", role: null, active: true, managerId: null },
];

function renderList(expenses: Expense[]) {
  return render(<OrgWideExpenseList expenses={expenses} employees={EMPLOYEES} />);
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = "/finance/expenses";
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockReplace.mockClear();
  vi.unstubAllGlobals();
});

describe("OrgWideExpenseList", () => {
  it("uses the shared one-per-status filter section with every status chip", () => {
    renderList([buildExpense()]);
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Draft", "Submitted", "In approval", "Approved", "In finance", "Paid", "Rejected"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^More filters/ })).toBeInTheDocument();
  });

  it("renders every claim at every stage in one table", () => {
    const list = [
      buildExpense({ id: "exp-draft", status: "draft", title: "Draft hotel", requesterId: "emp-shameel" }),
      buildExpense({ id: "exp-paid", ref: "EXP-2026-0002", status: "paid", title: "Office snacks" }),
      buildExpense({ id: "exp-rejected", ref: "EXP-2026-0003", status: "rejected", title: "Team lunch" }),
      buildExpense(),
    ];
    renderList(list);

    expect(screen.getByText("Draft hotel")).toBeInTheDocument();
    expect(screen.getByText("Office snacks")).toBeInTheDocument();
    expect(screen.getByText("Team lunch")).toBeInTheDocument();
    expect(screen.getByText("Client dinner")).toBeInTheDocument();
  });

  it("shows the requester name resolved from the employee roster", () => {
    renderList([buildExpense({ requesterId: "emp-ada" }), buildExpense({ id: "exp-2", requesterId: "emp-shameel" })]);

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Muhammad Shameel")).toBeInTheDocument();
  });

  it("filters the table to the chosen status chip", () => {
    const list = [
      buildExpense({ id: "exp-rejected", status: "rejected", title: "Team lunch" }),
      buildExpense({ id: "exp-in-finance", status: "in-finance", title: "Client dinner" }),
    ];
    renderList(list);

    fireEvent.click(screen.getByRole("button", { name: /^Rejected/ }));

    expect(screen.getByText("Team lunch")).toBeInTheDocument();
    expect(screen.queryByText("Client dinner")).not.toBeInTheDocument();
  });

  it("writes chip changes to the URL and hydrates back from it", async () => {
    renderList([buildExpense({ id: "exp-paid", status: "paid", title: "Office snacks" }), buildExpense()]);

    fireEvent.click(screen.getByRole("button", { name: /^Paid/ }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/finance/expenses?status=paid", { scroll: false }),
    );
    expect(screen.getByText("Office snacks")).toBeInTheDocument();
    expect(screen.queryByText("Client dinner")).not.toBeInTheDocument();
  });

  it("hydrates the table from a deep-linked filter URL", () => {
    mockSearchParams = new URLSearchParams("status=rejected&q=lunch");
    const list = [
      buildExpense({ id: "exp-rejected", status: "rejected", title: "Team lunch" }),
      buildExpense({ id: "exp-paid", status: "paid", title: "Office snacks" }),
    ];
    renderList(list);

    expect(screen.getByRole("button", { name: /^Rejected/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Team lunch")).toBeInTheDocument();
    expect(screen.queryByText("Office snacks")).not.toBeInTheDocument();
  });

  it("keeps the column header sort wired to the shared sort state and URL", async () => {
    const list = [
      buildExpense({ id: "exp-small", amount: 100, title: "Taxi" }),
      buildExpense({ id: "exp-large", amount: 9000, title: "Hotel" }),
    ];
    renderList(list);

    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(screen.getByText("Hotel")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/finance/expenses?sort=amount", { scroll: false }),
    );
    expect(screen.getByRole("columnheader", { name: "Amount" })).toHaveAttribute("aria-sort", "descending");
  });

  it("opens the expense drawer when a row is clicked or Enter is pressed", () => {
    const expense = buildExpense({ title: "Client dinner" });
    renderList([expense]);

    const row = screen.getByRole("row", { name: /Client dinner/ });
    expect(row).toHaveAttribute("tabindex", "0");

    fireEvent.click(row);

    expect(screen.getByRole("dialog", { name: `Expense details: ${expense.title}` })).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderList([buildExpense()]);
    fireEvent.click(screen.getByRole("button", { name: /^Rejected/ }));

    expect(screen.getByText("No expenses match your search.")).toBeInTheDocument();
  });
});
