// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseDrawer } from "./expense-drawer";
import type { Expense } from "./mock-data";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
  }),
}));

// The verify/pay responses carry the organization's employees so the drawer
// can render the stamped claim with real actor names.
const EMPLOYEES: ExpenseEmployee[] = [
  {
    id: "emp-user",
    organizationId: "org-1",
    name: "Muhammad Shameel",
    role: { id: "role-executive", code: "executive", displayName: "Executive" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-pramod",
    organizationId: "org-1",
    name: "Pramod",
    role: { id: "role-finance-head", code: "finance-head", displayName: "Finance Head" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-finance",
    organizationId: "org-1",
    name: "Rishikesh",
    role: { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive" },
    active: true,
    managerId: null,
  },
];

function verifiedResponse(): Response {
  return new Response(JSON.stringify({ claim: verifiedClaim(), employees: EMPLOYEES }), { status: 200 });
}

function paidResponse(): Response {
  return new Response(JSON.stringify({ claim: paidClaim(), employees: EMPLOYEES }), { status: 200 });
}

const BASE_HISTORY = [
  {
    id: "h-1",
    kind: "submitted",
    actorId: "emp-user",
    detail: "Sent for approval",
    createdAt: "2026-08-05T08:00:00.000Z",
  },
  {
    id: "h-2",
    kind: "approved",
    actorId: "emp-pramod",
    detail: "Finance Head review complete",
    createdAt: "2026-08-05T09:00:00.000Z",
  },
] satisfies ExpenseClaim["history"];

function buildClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "exp-123",
    ref: "EXP-1001",
    organizationId: "org-1",
    requesterId: "emp-user",
    title: "Flight ticket",
    category: "Travel",
    subCategory: "Flights",
    remark: "Client visit",
    amountMinor: 45000,
    currency: "INR",
    expenseDate: "2026-08-05",
    status: "in-finance",
    currentStage: "role-finance-executive",
    currentActorId: "emp-finance",
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-head",
        assignedActorId: "emp-pramod",
        status: "approved",
        decidedAt: "2026-08-05T09:00:00.000Z",
      },
      {
        id: "s-2",
        roleId: "role-finance-executive",
        assignedActorId: "emp-finance",
        status: "pending",
      },
    ],
    history: [...BASE_HISTORY],
    version: 3,
    createdAt: "2026-08-05T08:00:00.000Z",
    submittedAt: "2026-08-05T08:00:00.000Z",
    ...overrides,
  };
}

function verifiedClaim(): ExpenseClaim {
  return buildClaim({
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-head",
        assignedActorId: "emp-pramod",
        status: "approved",
        decidedAt: "2026-08-05T09:00:00.000Z",
      },
      {
        id: "s-2",
        roleId: "role-finance-executive",
        assignedActorId: "emp-finance",
        status: "verified",
        decidedAt: "2026-08-05T10:00:00.000Z",
      },
    ],
    history: [
      ...BASE_HISTORY,
      {
        id: "h-3",
        kind: "verified",
        actorId: "emp-finance",
        detail: "Claim verified for payment",
        createdAt: "2026-08-05T10:00:00.000Z",
      },
    ],
    version: 4,
  });
}

function paidClaim(): ExpenseClaim {
  return buildClaim({
    status: "paid",
    currentStage: undefined,
    currentActorId: undefined,
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-head",
        assignedActorId: "emp-pramod",
        status: "approved",
        decidedAt: "2026-08-05T09:00:00.000Z",
      },
      {
        id: "s-2",
        roleId: "role-finance-executive",
        assignedActorId: "emp-finance",
        status: "paid",
        decidedAt: "2026-08-05T10:30:00.000Z",
      },
    ],
    history: [
      ...BASE_HISTORY,
      {
        id: "h-3",
        kind: "verified",
        actorId: "emp-finance",
        detail: "Claim verified for payment",
        createdAt: "2026-08-05T10:00:00.000Z",
      },
      {
        id: "h-4",
        kind: "paid",
        actorId: "emp-finance",
        detail: "Payment marked complete",
        createdAt: "2026-08-05T10:30:00.000Z",
      },
    ],
    version: 5,
  });
}

function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-123",
    ref: "EXP-1001",
    title: "Flight ticket",
    category: "Travel",
    amount: 450,
    currency: "INR",
    date: "Aug 5",
    submittedAt: "2026-08-05T08:00:00.000Z",
    status: "in-finance",
    requesterId: "emp-user",
    nextStage: "Finance verification",
    nextActor: "Finance Officer",
    nextActorId: "emp-finance",
    attachments: [],
    attachmentAvailable: false,
    history: [
      {
        id: "h-1",
        date: "Aug 5",
        actor: "Muhammad Shameel",
        actorId: "emp-user",
        kind: "submitted",
        detail: "Submitted for approval",
      },
    ],
    steps: [
      {
        id: "s-2",
        roleId: "role-finance-executive",
        roleName: "Finance Officer",
        assignedActorId: "emp-finance",
        assignedActorName: "Finance Officer",
        status: "pending",
      },
    ],
    primaryAction: "verify",
    ...overrides,
  };
}

describe("ExpenseDrawer verification and payment workflow", () => {
  const defaultUser = "Finance Officer";
  const defaultUserId = "emp-finance";

  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("handles verification live inside drawer without full reload and shows prompt banner", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(verifiedResponse()),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    const verifyBtn = screen.getByRole("button", { name: "Verify for payment" });
    expect(verifyBtn).toBeInTheDocument();

    fireEvent.click(verifyBtn);

    expect(fetch).toHaveBeenCalledWith("/api/expenses/exp-123/verify", { method: "POST" });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Mark payment prompt" })).toBeInTheDocument();
    });

    expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, Mark Paid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep Verified" })).toBeInTheDocument();

    const promptRegion = screen.getByRole("region", { name: "Mark payment prompt" });
    await waitFor(() => {
      expect(promptRegion).toHaveFocus();
    });
  });

  it("completes payment when 'Yes, Mark Paid' is clicked in prompt", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/verify")) {
          return Promise.resolve(verifiedResponse());
        }
        if (url.endsWith("/pay")) {
          return Promise.resolve(paidResponse());
        }
        return Promise.reject(new Error("Unknown route"));
      }),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    const yesBtn = screen.getByRole("button", { name: "Yes, Mark Paid" });
    fireEvent.click(yesBtn);

    expect(fetch).toHaveBeenCalledWith("/api/expenses/exp-123/pay", { method: "POST" });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Mark payment prompt" })).not.toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();
    });
  });

  it("dismisses prompt banner and leaves claim as verified when 'Keep Verified' is clicked", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(verifiedResponse()),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    const keepBtn = screen.getByRole("button", { name: "Keep Verified" });
    fireEvent.click(keepBtn);

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Mark payment prompt" })).not.toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close details" })).toHaveFocus();
    });
  });

  it("leaves earlier approved steps untouched after verify - only the terminal pending step is stamped", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(verifiedResponse()),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    expect(screen.getByText("Finance Head review complete")).toBeInTheDocument();
    expect(screen.getByText("Finance verified")).toBeInTheDocument();
    expect(screen.getAllByText("Finance Executive").length).toBeGreaterThan(0);
    expect(screen.queryByText("Finance Head")).not.toBeInTheDocument();
  });

  it("renders the stamped claim with real actor names, not System placeholders", async () => {
    const expense = buildExpense();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(verifiedResponse()));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    // The server-stamped claim resolves history actors and the assigned
    // finance executive through the employee list in the response.
    expect(screen.getByText("Muhammad Shameel")).toBeInTheDocument();
    expect(screen.getByText("Pramod")).toBeInTheDocument();
    expect(screen.getAllByText("Rishikesh").length).toBeGreaterThan(0);
    expect(screen.queryByText("System")).not.toBeInTheDocument();
    // The verified terminal step reads as awaiting payment, not pending
    // verification.
    expect(screen.getByText("Awaiting payment confirmation")).toBeInTheDocument();
  });

  it("refreshes the queue when the drawer is closed via the X button after verifying", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(verifiedResponse()),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    expect(mockRefresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not render the footer 'Mark as paid' button while the prompt is visible", async () => {
    const expense = buildExpense();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(verifiedResponse()),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() => {
      expect(screen.getByText("Mark payment as completed now?")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Yes, Mark Paid" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
  });
});
