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

const downloadBlobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/download-blob", () => ({
  downloadBlob: downloadBlobMock,
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
  {
    id: "emp-sanil",
    organizationId: "org-1",
    name: "Sanil Davis",
    role: { id: "role-manager", code: "manager", displayName: "Manager" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-super",
    organizationId: "org-1",
    name: "Super Boss",
    role: { id: "role-superadmin", code: "superadmin", displayName: "Superadmin" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-inactive",
    organizationId: "org-1",
    name: "Gone Person",
    role: { id: "role-executive", code: "executive", displayName: "Executive" },
    active: false,
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

function terminalExpense(status: "paid" | "rejected"): Expense {
  return buildExpense({ status, primaryAction: undefined });
}

function draftExpense(): Expense {
  return buildExpense({ status: "draft", primaryAction: undefined });
}

describe("ExpenseDrawer verification and payment workflow", () => {
  const defaultUser = "Finance Officer";
  const defaultUserId = "emp-finance";

  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    downloadBlobMock.mockReset();
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

  it("enables verify for a pool member holding the terminal role even when not the assigned actor", async () => {
    const expense = buildExpense({ nextActorId: "emp-finance-other" });

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser="Rishikesh 2"
        currentUserId="emp-rishikesh"
        currentUserRoleId="role-finance-executive"
      />,
    );

    const verifyBtn = screen.getByRole("button", { name: "Verify for payment" });
    expect(verifyBtn).toBeEnabled();
    expect(screen.getByText("Waiting on you.")).toBeInTheDocument();
  });

  it("keeps verify disabled for a viewer holding a different role than the terminal step", async () => {
    const expense = buildExpense({ nextActorId: "emp-finance-other" });

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser="Pramod"
        currentUserId="emp-pramod"
        currentUserRoleId="role-finance-head"
      />,
    );

    expect(screen.getByRole("button", { name: "Verify for payment" })).toBeDisabled();
  });

  it("does not offer Reject to a pool member who is not the assigned actor", async () => {
    const expense = buildExpense({ nextActorId: "emp-finance-other" });

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser="Rishikesh 2"
        currentUserId="emp-rishikesh"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.getByRole("button", { name: "Verify for payment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("does not refresh the queue again when closing after 'Yes, Mark Paid' already refreshed", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Yes, Mark Paid" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Mark payment prompt" })).not.toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("ExpenseDrawer hold and resume (ADR-0016)", () => {
  const defaultUser = "Finance Officer";
  const defaultUserId = "emp-finance";

  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    downloadBlobMock.mockReset();
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

  function heldClaimResponse(): Response {
    const held = buildClaim({
      status: "in-finance",
      currentStage: "role-finance-executive",
      currentActorId: "emp-finance",
      heldAt: "2026-08-05T12:00:00.000Z",
      heldBy: "emp-finance",
      heldReason: "Awaiting the missing invoice",
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
      history: [
        ...BASE_HISTORY,
        {
          id: "h-3",
          kind: "held",
          actorId: "emp-finance",
          detail: "Awaiting the missing invoice",
          createdAt: "2026-08-05T12:00:00.000Z",
        },
      ],
      version: 4,
    });
    return new Response(JSON.stringify({ claim: held, employees: EMPLOYEES }), { status: 200 });
  }

  function heldExpense(): Expense {
    return buildExpense({
      held: {
        by: "Finance Officer",
        at: "2026-08-05T12:00:00.000Z",
        reason: "Awaiting the missing invoice",
      },
      primaryAction: undefined,
    });
  }

  it("offers the Hold action to the current stage actor whose role can hold", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
        currentUserCanHold
      />,
    );

    expect(screen.getByRole("button", { name: "Hold" })).toBeInTheDocument();
  });

  it("hides the Hold action when the viewer's role cannot hold", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    expect(screen.queryByRole("button", { name: "Hold" })).not.toBeInTheDocument();
  });

  it("hides the Hold action from a pool member who is not the assigned actor", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense({ nextActorId: "emp-finance-other" })}
        currentUser="Rishikesh 2"
        currentUserId="emp-rishikesh"
        currentUserRoleId="role-finance-executive"
        currentUserCanHold
      />,
    );

    expect(screen.getByRole("button", { name: "Verify for payment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Hold" })).not.toBeInTheDocument();
  });

  it("holds a claim through the reason prompt, requiring a reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(heldClaimResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
        currentUserCanHold
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    expect(screen.getByRole("dialog", { name: "Hold this claim" })).toBeInTheDocument();

    // An empty reason is refused client-side with an inline error.
    fireEvent.click(screen.getByRole("button", { name: "Hold claim" }));
    expect(screen.getByText("Enter a reason for holding this claim.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Awaiting the missing invoice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hold claim" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/exp-123/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Awaiting the missing invoice" }),
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Hold this claim" })).not.toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's hold error inside the prompt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "This claim is already held." }), { status: 409 }),
      ),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
        currentUserCanHold
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Hold again" } });
    fireEvent.click(screen.getByRole("button", { name: "Hold claim" }));

    await waitFor(() => {
      expect(screen.getByText("This claim is already held.")).toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "Hold this claim" })).toBeInTheDocument();
  });

  it("renders a held claim with the Held badge and no terminal actions", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
        currentUserCanHold
      />,
    );

    expect(screen.getByText("Held")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hold" })).not.toBeInTheDocument();
    expect(screen.getByText("This claim is on hold.")).toBeInTheDocument();
    expect(screen.getByText("Awaiting the missing invoice")).toBeInTheDocument();
  });

  it("offers Resume to the current stage actor of a held claim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ claim: buildClaim({ history: [...BASE_HISTORY] }), employees: EMPLOYEES }),
          { status: 200 },
        ),
      ),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    const resumeBtn = screen.getByRole("button", { name: "Resume claim" });
    fireEvent.click(resumeBtn);

    expect(fetch).toHaveBeenCalledWith("/api/expenses/exp-123/resume", { method: "POST" });

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
    // The stamped claim is un-held: the drawer flips back to the primary
    // action and the Held badge animates out.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Verify for payment" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText("Held")).not.toBeInTheDocument();
    });
  });

  it("shows a disabled On hold state to a viewer who is not the current actor", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpense()}
        currentUser="Pramod"
        currentUserId="emp-pramod"
        currentUserRoleId="role-finance-head"
      />,
    );

    expect(screen.getByRole("button", { name: "On hold" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Resume claim" })).not.toBeInTheDocument();
  });

  it("surfaces the server's resume error in the footer banner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "This expense claim is not assigned to you." }), {
          status: 403,
        }),
      ),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpense()}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Resume claim" }));

    await waitFor(() => {
      expect(
        screen.getByText("This expense claim is not assigned to you."),
      ).toBeInTheDocument();
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("ExpenseDrawer delegation (ADR-0017)", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    downloadBlobMock.mockReset();
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

  function employeesResponse(): Response {
    return new Response(JSON.stringify({ claim: buildClaim(), employees: EMPLOYEES }), { status: 200 });
  }

  function delegatedClaimResponse(): Response {
    const delegated = buildClaim({
      currentActorId: "emp-sanil",
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
          assignedActorId: "emp-sanil",
          status: "pending",
        },
      ],
      history: [
        ...BASE_HISTORY,
        {
          id: "h-4",
          kind: "delegated",
          actorId: "emp-super",
          detail: 'Delegated to Sanil Davis (Manager) for "Pramod is away"',
          createdAt: "2026-08-05T11:00:00.000Z",
        },
      ],
      version: 4,
    });
    return new Response(JSON.stringify({ claim: delegated, employees: EMPLOYEES }), { status: 200 });
  }

  function heldExpenseForDelegate(): Expense {
    return buildExpense({
      held: {
        by: "Finance Officer",
        at: "2026-08-05T12:00:00.000Z",
        reason: "Awaiting the missing invoice",
      },
      primaryAction: undefined,
    });
  }

  it("shows the Delegate action to a Superadmin viewer on an in-flight claim", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleCode="superadmin"
      />,
    );

    expect(screen.getByRole("button", { name: "Delegate" })).toBeInTheDocument();
  });

  it("hides the Delegate action from non-Superadmin viewers", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser="Rishikesh"
        currentUserId="emp-finance"
        currentUserRoleCode="finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Delegate" })).not.toBeInTheDocument();
  });

  it("does not offer the Delegate action on drafts or terminal claims", () => {
    for (const status of ["draft", "paid", "rejected"] as const) {
      cleanup();
      render(
        <ExpenseDrawer
          open={true}
          onOpenChange={vi.fn()}
          expense={buildExpense({ status, primaryAction: undefined })}
          currentUser="Super Boss"
          currentUserId="emp-super"
          currentUserRoleCode="superadmin"
        />,
      );
      expect(screen.queryByRole("button", { name: "Delegate" })).not.toBeInTheDocument();
    }
  });

  it("offers the Delegate action on a held claim so the claim can be re-routed while paused", () => {
    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpenseForDelegate()}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleCode="superadmin"
      />,
    );

    expect(screen.getByRole("button", { name: "Delegate" })).toBeInTheDocument();
  });

  it("delegates through the person picker: active employees only, current actor excluded, reason required", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/delegate")) return Promise.resolve(delegatedClaimResponse());
      return Promise.resolve(employeesResponse());
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleCode="superadmin"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delegate" }));
    expect(screen.getByRole("dialog", { name: "Delegate this claim" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/exp-123");

    await waitFor(() => {
      expect(screen.getByText("Sanil Davis")).toBeInTheDocument();
    });
    // Active employees show up; the current actor (Rishikesh) and inactive
    // employees are excluded from the picker.
    expect(screen.getByText("Pramod")).toBeInTheDocument();
    expect(screen.queryByText("Rishikesh")).not.toBeInTheDocument();
    expect(screen.queryByText("Gone Person")).not.toBeInTheDocument();

    // A missing selection is refused client-side.
    fireEvent.click(screen.getByRole("button", { name: "Confirm delegation" }));
    expect(screen.getByText("Choose a person to delegate to.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/expenses/exp-123/delegate",
      expect.anything(),
    );

    // Search narrows the picker.
    fireEvent.change(screen.getByLabelText("Person"), { target: { value: "Sanil" } });
    expect(screen.getByText("Sanil Davis")).toBeInTheDocument();
    expect(screen.queryByText("Pramod")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Sanil Davis"));
    // An empty reason is refused client-side.
    fireEvent.click(screen.getByRole("button", { name: "Confirm delegation" }));
    expect(screen.getByText("Enter a reason for delegating this claim.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Pramod is away" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm delegation" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/exp-123/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delegateeId: "emp-sanil", reason: "Pramod is away" }),
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Delegate this claim" })).not.toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows the held note in the delegate dialog when the claim is held", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(employeesResponse()));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={heldExpenseForDelegate()}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleCode="superadmin"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delegate" }));

    await waitFor(() => {
      expect(
        screen.getByText("This claim is held. Delegating keeps it held - the new actor resumes it."),
      ).toBeInTheDocument();
    });
  });

  it("surfaces the server's delegate error inside the dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/delegate")) {
          return Promise.resolve(
            new Response(JSON.stringify({ message: "Choose a different person to delegate to." }), {
              status: 422,
            }),
          );
        }
        return Promise.resolve(employeesResponse());
      }),
    );

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={buildExpense()}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleCode="superadmin"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delegate" }));
    await waitFor(() => {
      expect(screen.getByText("Sanil Davis")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Sanil Davis"));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Handover" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm delegation" }));

    await waitFor(() => {
      expect(screen.getByText("Choose a different person to delegate to.")).toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "Delegate this claim" })).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("ExpenseDrawer summary download", () => {
  const defaultUser = "Finance Officer";
  const defaultUserId = "emp-finance";

  beforeEach(() => {
    mockRefresh.mockReset();
    mockPush.mockReset();
    downloadBlobMock.mockReset();
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

  it("downloads the summary PDF from the enabled primary button of a paid claim", async () => {
    const expense = terminalExpense("paid");
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(pdfBytes));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    const downloadBtn = screen.getByRole("button", { name: "Download summary" });
    expect(downloadBtn).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Download summary" })).toHaveLength(1);

    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/exp-123/summary");
    expect(downloadBlobMock).toHaveBeenCalledWith(expect.objectContaining({ size: 4 }), "EXP-1001-summary.pdf");
  });

  it("offers the enabled Download summary primary button on a rejected claim", async () => {
    const expense = terminalExpense("rejected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array())));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    const downloadBtn = screen.getByRole("button", { name: "Download summary" });
    expect(downloadBtn).toBeEnabled();
    expect(screen.queryByText("No action available")).not.toBeInTheDocument();
  });

  it("keeps the in-progress primary action and adds a secondary download button", async () => {
    const expense = buildExpense();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array())));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    expect(screen.getByRole("button", { name: "Verify for payment" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Download summary" })).toBeEnabled();
  });

  it("keeps the draft actions and adds a secondary download button on drafts", async () => {
    const expense = draftExpense();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array())));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download summary" })).toBeEnabled();
  });

  it("surfaces the server error message and saves no file when the summary request is not ok", async () => {
    const expense = terminalExpense("paid");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: "not-found", message: "This claim is not available to you." }),
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("This claim is not available to you.");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/exp-123/summary");
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });

  it("shows a network error and saves no file when the summary fetch fails", async () => {
    const expense = terminalExpense("paid");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(
      <ExpenseDrawer
        open={true}
        onOpenChange={vi.fn()}
        expense={expense}
        currentUser={defaultUser}
        currentUserId={defaultUserId}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download summary" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not reach the server. Check your connection and try again.",
      );
    });
    expect(downloadBlobMock).not.toHaveBeenCalled();
  });
});
