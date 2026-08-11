// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullExpenseList } from "./full-expense-list";
import { expenses, type Expense } from "./mock-data";

const mockReplace = vi.fn();
let mockPathname = "/expenses/all";
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

function renderList(list: Expense[]) {
  return render(
    <FullExpenseList
      expenses={list}
      currentUser="Sanil Davis"
      currentUserId="emp-user"
      currentUserRoleId="role-manager"
      currentUserRoleCode="manager"
      currentUserCanHold
    />,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPathname = "/expenses/all";
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  mockReplace.mockClear();
  vi.unstubAllGlobals();
});

describe("FullExpenseList shared filter section (ADR-0021)", () => {
  it("uses the same one-per-status filter section as the dashboard surface", () => {
    renderList(expenses);
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
    for (const label of ["Draft", "Submitted", "In approval", "Approved", "In finance", "Paid", "Rejected"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /^More filters/ })).toBeInTheDocument();
  });

  it("filters the table to the chosen status chip", () => {
    renderList(expenses);
    fireEvent.click(screen.getByRole("button", { name: /^Rejected/ }));
    expect(screen.getByText("Client dinner — Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("USB-C hub + cables")).toBeInTheDocument();
    expect(screen.queryByText("Office snacks — pantry restock")).not.toBeInTheDocument();
  });

  it("writes chip changes to the URL and hydrates back from it", async () => {
    renderList(expenses);
    fireEvent.click(screen.getByRole("button", { name: /^Approved/ }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/expenses/all?status=approved", { scroll: false }),
    );
    expect(screen.getByText("Hotel — Karachi office week")).toBeInTheDocument();
  });

  it("hydrates the table from a deep-linked filter URL", () => {
    mockSearchParams = new URLSearchParams("status=paid&q=pantry");
    renderList(expenses);
    expect(screen.getByRole("button", { name: /^Paid/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Office snacks — pantry restock")).toBeInTheDocument();
    expect(screen.queryByText("Taxi — airport pickup")).not.toBeInTheDocument();
  });

  it("keeps the column header sort wired to the shared sort state and URL", async () => {
    renderList(expenses);
    fireEvent.click(screen.getByRole("button", { name: "Amount" }));
    expect(screen.getByText("Hotel — Karachi office week")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/expenses/all?sort=amount", { scroll: false }),
    );
    expect(screen.getByRole("columnheader", { name: "Amount" })).toHaveAttribute("aria-sort", "descending");
  });
});
