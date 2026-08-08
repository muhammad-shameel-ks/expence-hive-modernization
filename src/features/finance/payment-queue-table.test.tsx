// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentQueueTable } from "./payment-queue-table";
import type { ExpenseClaim } from "@/server/expenses/ports";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

function buildClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-0001",
    organizationId: "org-1",
    requesterId: "employee-1",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 125000,
    currency: "INR",
    expenseDate: "2026-08-01",
    status: "in-finance",
    steps: [],
    history: [],
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    submittedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildTerminalClaim(stepStatus: "pending" | "verified"): ExpenseClaim {
  return buildClaim({
    steps: [
      {
        id: "s-1",
        roleId: "role-finance-executive",
        status: stepStatus,
      },
    ],
  });
}

describe("PaymentQueueTable comment save loading state", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})), // never resolves until we control it below
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks the comment input busy and shows a spinner while the save is pending", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const claim = buildClaim();
    render(<PaymentQueueTable claims={[claim]} employees={[]} />);

    const input = screen.getByRole("textbox", { name: `Comment for ${claim.ref}` });
    expect(input).not.toHaveAttribute("aria-busy");

    input.focus();
    (input as HTMLInputElement).value = "Approved by finance";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();

    // While the PATCH request is in flight, the input surfaces the pending
    // save via aria-busy/disabled and the inline spinner remains visible.
    await waitFor(() => expect(input).toHaveAttribute("aria-busy", "true"));
    expect(input).toBeDisabled();
    expect(document.querySelector(".animate-spin")).not.toBeNull();

    resolveFetch(new Response(null, { status: 200 }));

    await waitFor(() => expect(input).not.toHaveAttribute("aria-busy"));
    expect(input).not.toBeDisabled();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});

describe("PaymentQueueTable terminal verify/pay actions", () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers Verify for payment on a pending in-finance claim to a terminal pool member", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("pending")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    const verifyBtn = screen.getByRole("button", { name: "Verify for payment" });
    expect(verifyBtn).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("offers Mark paid on a verified in-finance claim to a terminal pool member", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.getByRole("button", { name: "Mark paid" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
  });

  it("hides the action when the viewer holds a different role than the terminal step", () => {
    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("pending")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-head"
      />,
    );

    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("hides the action for paid claims", () => {
    const paid = buildTerminalClaim("verified");
    paid.status = "paid";
    render(
      <PaymentQueueTable
        claims={[paid]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
  });

  it("hides the action when the viewer is the requester of the claim", () => {
    const claim = buildTerminalClaim("pending");
    claim.requesterId = "emp-finance-2";
    render(
      <PaymentQueueTable
        claims={[claim]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    expect(screen.queryByRole("button", { name: "Verify for payment" })).not.toBeInTheDocument();
  });

  it("POSTs verify and refreshes the queue on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ claim: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("pending")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/claim-1/verify", { method: "POST" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("POSTs pay and refreshes the queue on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ claim: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("verified")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark paid" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/claim-1/pay", { method: "POST" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
  });

  it("surfaces the server's error message inline when the action fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: "You are not eligible to process this claim's terminal stage." }), {
          status: 403,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PaymentQueueTable
        claims={[buildTerminalClaim("pending")]}
        employees={[]}
        currentUserId="emp-finance-2"
        currentUserRoleId="role-finance-executive"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Verify for payment" }));

    await waitFor(() =>
      expect(
        screen.getByText("You are not eligible to process this claim's terminal stage."),
      ).toBeInTheDocument(),
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
