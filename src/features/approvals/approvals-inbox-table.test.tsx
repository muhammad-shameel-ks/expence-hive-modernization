// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalsInboxTable } from "./approvals-inbox-table";
import type { Expense } from "@/features/dashboard/mock-data";
import type { ExpenseEmployee } from "@/server/expenses/ports";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

const EMPLOYEES: ExpenseEmployee[] = [
  {
    id: "emp-shameel",
    organizationId: "org-1",
    name: "Muhammad Shameel",
    role: { id: "role-exec", code: "executive", displayName: "Executive" },
    active: true,
    managerId: "emp-ada",
  },
  {
    id: "emp-katherine",
    organizationId: "org-1",
    name: "Katherine Johnson",
    role: { id: "role-exec", code: "executive", displayName: "Executive" },
    active: true,
    managerId: "emp-ada",
  },
  {
    id: "emp-ada",
    organizationId: "org-1",
    name: "Ada Lovelace",
    role: { id: "role-mgr", code: "manager", displayName: "Manager" },
    active: true,
    managerId: null,
  },
];

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    ref: "EXP-2026-0001",
    title: "Client dinner",
    category: "Meals",
    amount: 2400,
    currency: "INR",
    date: "Aug 4",
    expenseDate: "2026-08-04",
    submittedAt: "2026-08-04T10:42:00Z",
    status: "in-approval",
    requesterId: "emp-shameel",
    nextStage: "Manager approval",
    nextActor: "Ada Lovelace",
    attachments: [],
    history: [],
    ...overrides,
  };
}

function renderTable(expenses: Expense[] = [buildExpense()]) {
  return render(
    <ApprovalsInboxTable
      expenses={expenses}
      employees={EMPLOYEES}
      currentUser="Ada Lovelace"
      currentUserId="emp-ada"
      currentUserRoleId="role-mgr"
      currentUserRoleCode="manager"
    />,
  );
}

beforeEach(() => {
  mockRefresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ report: { approved: [], skipped: [] } }),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApprovalsInboxTable", () => {
  it("renders empty state when no expenses await approval", () => {
    renderTable([]);
    expect(screen.getByText("No expenses awaiting your approval")).toBeInTheDocument();
  });

  it("renders pending approval claims with details", () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner", amount: 2400 }),
      buildExpense({
        id: "exp-2",
        ref: "EXP-2026-0002",
        title: "Flight ticket",
        category: "Travel",
        amount: 8500,
        requesterId: "emp-katherine",
      }),
    ];
    renderTable(list);

    expect(screen.getByText("Client dinner")).toBeInTheDocument();
    expect(screen.getByText("Flight ticket")).toBeInTheDocument();
    expect(screen.getByText("Muhammad Shameel")).toBeInTheDocument();
    expect(screen.getByText("Katherine Johnson")).toBeInTheDocument();
    expect(screen.getByText("₹2,400.00")).toBeInTheDocument();
    expect(screen.getByText("₹8,500.00")).toBeInTheDocument();
  });

  it("filters claims by search query across title, ref, and requester name", () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner", requesterId: "emp-shameel" }),
      buildExpense({ id: "exp-2", title: "Flight ticket", requesterId: "emp-katherine" }),
    ];
    renderTable(list);

    const searchInput = screen.getByLabelText("Search pending approvals");
    fireEvent.change(searchInput, { target: { value: "Flight" } });

    expect(screen.queryByText("Client dinner")).not.toBeInTheDocument();
    expect(screen.getByText("Flight ticket")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "Shameel" } });
    expect(screen.getByText("Client dinner")).toBeInTheDocument();
    expect(screen.queryByText("Flight ticket")).not.toBeInTheDocument();
  });

  it("filters claims by category", () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner", category: "Meals" }),
      buildExpense({ id: "exp-2", title: "Flight ticket", category: "Travel" }),
    ];
    renderTable(list);

    const categorySelect = screen.getByLabelText("Filter by category");
    fireEvent.change(categorySelect, { target: { value: "Meals" } });

    expect(screen.getByText("Client dinner")).toBeInTheDocument();
    expect(screen.queryByText("Flight ticket")).not.toBeInTheDocument();
  });

  it("manages multi-selection and displays selected count and total amount", () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner", amount: 2000 }),
      buildExpense({ id: "exp-2", ref: "EXP-2026-0002", title: "Flight ticket", amount: 3000 }),
    ];
    renderTable(list);

    const check1 = screen.getByLabelText("Select claim EXP-2026-0001");
    const check2 = screen.getByLabelText("Select claim EXP-2026-0002");

    fireEvent.click(check1);
    expect(screen.getByText("1 selected · ₹2,000.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve selected \(1\)/i })).toBeInTheDocument();

    fireEvent.click(check2);
    expect(screen.getByText("2 selected · ₹5,000.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve selected \(2\)/i })).toBeInTheDocument();

    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearButton);
    expect(screen.queryByText(/selected ·/)).not.toBeInTheDocument();
  });

  it("toggles all claims selection with the header checkbox", () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner" }),
      buildExpense({ id: "exp-2", ref: "EXP-2026-0002", title: "Flight ticket" }),
    ];
    renderTable(list);

    const selectAll = screen.getByLabelText("Select all claims in list");
    fireEvent.click(selectAll);
    expect(screen.getByText("2 selected · ₹4,800.00")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(screen.queryByText(/selected ·/)).not.toBeInTheDocument();
  });

  it("opens confirmation modal on clicking approve selected and executes bulk approval with comment", async () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner", amount: 2400 }),
      buildExpense({ id: "exp-2", ref: "EXP-2026-0002", title: "Flight ticket", amount: 5000 }),
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        report: {
          approved: [
            { id: "exp-1", status: "in-finance" },
            { id: "exp-2", status: "in-finance" },
          ],
          skipped: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    const selectAll = screen.getByLabelText("Select all claims in list");
    fireEvent.click(selectAll);

    const approveButton = screen.getByRole("button", { name: /Approve selected \(2\)/i });
    fireEvent.click(approveButton);

    expect(screen.getByText("Approve 2 expense claims")).toBeInTheDocument();
    expect(screen.getByText("₹7,400.00")).toBeInTheDocument();

    const commentInput = screen.getByLabelText(/Approval note/i);
    fireEvent.change(commentInput, { target: { value: "Approved within Q3 budget" } });

    const confirmButton = screen.getByRole("button", { name: /Confirm & Approve \(2\)/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/expenses/bulk-approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimIds: ["exp-1", "exp-2"],
          comment: "Approved within Q3 budget",
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Successfully approved 2 expense claims.")).toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("displays warnings if bulk approval has skipped claims", async () => {
    const list = [
      buildExpense({ id: "exp-1", title: "Client dinner" }),
      buildExpense({ id: "exp-2", ref: "EXP-2026-0002", title: "Flight ticket" }),
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        report: {
          approved: [{ id: "exp-1", status: "in-finance" }],
          skipped: [{ claimId: "exp-2", reason: "conflict", message: "This claim was modified by another action." }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    fireEvent.click(screen.getByLabelText("Select all claims in list"));
    fireEvent.click(screen.getByRole("button", { name: /Approve selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Approve/i }));

    await waitFor(() => {
      expect(screen.getByText(/Approval completed with warnings: 1 approved, 1 skipped\./)).toBeInTheDocument();
      expect(screen.getByText(/This claim was modified by another action\./)).toBeInTheDocument();
    });
  });

  it("displays error message if server returns failure status", async () => {
    const list = [buildExpense({ id: "exp-1" })];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: "You are not authorized to approve these claims." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    fireEvent.click(screen.getByLabelText("Select claim EXP-2026-0001"));
    fireEvent.click(screen.getByRole("button", { name: /Approve selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Approve/i }));

    await waitFor(() => {
      expect(screen.getByText("You are not authorized to approve these claims.")).toBeInTheDocument();
    });
  });

  it("opens ExpenseDrawer when clicking a row", () => {
    renderTable([buildExpense({ title: "Hotel stay" })]);

    const titleCell = screen.getByText("Hotel stay");
    fireEvent.click(titleCell);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("displays 'Verify selected' and executes bulk verification when items require verification", async () => {
    const list = [
      buildExpense({ id: "exp-v1", title: "Cloud bill", amount: 1200, primaryAction: "verify", status: "in-finance" }),
      buildExpense({ id: "exp-v2", ref: "EXP-2026-0002", title: "License renewal", amount: 3500, primaryAction: "verify", status: "in-finance" }),
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        report: {
          verified: [
            { id: "exp-v1", status: "in-finance" },
            { id: "exp-v2", status: "in-finance" },
          ],
          skipped: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    // Header says Pending verification when all claims are verification claims
    expect(screen.getByText(/Pending verification \(2\)/i)).toBeInTheDocument();

    const selectAll = screen.getByLabelText("Select all claims in list");
    fireEvent.click(selectAll);

    const verifyButton = screen.getByRole("button", { name: /Verify selected \(2\)/i });
    expect(verifyButton).toBeInTheDocument();
    fireEvent.click(verifyButton);

    expect(screen.getByText("Verify 2 expense claims")).toBeInTheDocument();
    expect(screen.getByText("₹4,700.00")).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /Confirm & Verify \(2\)/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/expenses/bulk-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          claimIds: ["exp-v1", "exp-v2"],
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Successfully verified 2 expense claims.")).toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("displays warnings if bulk verification has skipped claims", async () => {
    const list = [
      buildExpense({ id: "exp-v1", title: "Cloud bill", primaryAction: "verify", status: "in-finance" }),
      buildExpense({ id: "exp-v2", ref: "EXP-2026-0002", title: "License renewal", primaryAction: "verify", status: "in-finance" }),
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        report: {
          verified: [{ id: "exp-v1", status: "in-finance" }],
          skipped: [{ claimId: "exp-v2", reason: "conflict", message: "This claim was modified by another action." }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    fireEvent.click(screen.getByLabelText("Select all claims in list"));
    fireEvent.click(screen.getByRole("button", { name: /Verify selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Verify/i }));

    await waitFor(() => {
      expect(screen.getByText(/Verification completed with warnings: 1 verified, 1 skipped\./)).toBeInTheDocument();
      expect(screen.getByText(/This claim was modified by another action\./)).toBeInTheDocument();
    });
  });

  it("keeps a mixed selection's already-verified claims processed when the approve leg fails afterward", async () => {
    const list = [
      buildExpense({ id: "exp-v1", title: "Cloud bill", primaryAction: "verify", status: "in-finance" }),
      buildExpense({ id: "exp-a1", ref: "EXP-2026-0002", title: "Hotel stay", primaryAction: "approve", status: "in-approval" }),
    ];

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/expenses/bulk-verify") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ report: { verified: [{ id: "exp-v1", status: "in-finance" }], skipped: [] } }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ message: "The bulk approval could not be completed. Please try again." }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderTable(list);

    fireEvent.click(screen.getByLabelText("Select all claims in list"));
    fireEvent.click(screen.getByRole("button", { name: /Process selected \(2\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Process/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/expenses/bulk-verify", expect.anything());
      expect(fetchMock).toHaveBeenCalledWith("/api/expenses/bulk-approve", expect.anything());
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          /The bulk approval could not be completed\. Please try again\. 1 expense claim were already processed before this failure/,
        ),
      ).toBeInTheDocument();
    });
    // The verified claim's success is not hidden by the approve leg's failure.
    expect(mockRefresh).toHaveBeenCalled();
  });
});
