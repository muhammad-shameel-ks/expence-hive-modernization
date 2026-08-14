// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingBankDetailChange } from "@/server/expenses/profile";
import type { BankDetails } from "@/server/expenses/ports";
import { BankDetailApprovals } from "./bank-detail-approvals";

const CURRENT_DETAILS: BankDetails = {
  holderName: "Muhammad Shameel",
  accountNumber: "90123456789012",
  ifsc: "ICIC0004567",
  bankName: "ICICI Bank",
  branch: "Koramangala",
};

const REQUESTED_DETAILS: BankDetails = {
  holderName: "Muhammad Shameel",
  accountNumber: "60123456789013",
  ifsc: "SBIN0002345",
  bankName: "State Bank of India",
  branch: "Whitefield",
};

function pendingRequest(overrides: Partial<PendingBankDetailChange> = {}): PendingBankDetailChange {
  return {
    id: "bank-change-1",
    organizationId: "org-1",
    employeeId: "emp-shameel",
    status: "pending",
    requested: REQUESTED_DETAILS,
    requesterId: "emp-shameel",
    requesterName: "Muhammad Shameel",
    requesterRole: "Executive",
    currentApproved: CURRENT_DETAILS,
    requestedAt: "2026-08-04T10:00:00.000Z",
    history: [{ id: "history-1", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
    ...overrides,
  };
}

function listResponse(requests: PendingBankDetailChange[]) {
  return { ok: true, json: async () => ({ requests }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BankDetailApprovals", () => {
  it("shows the empty state when nothing is pending", () => {
    render(<BankDetailApprovals currentUserId="emp-pramod" initialRequests={[]} />);

    expect(screen.getByText("No pending bank-detail change requests.")).toBeInTheDocument();
  });

  it("lists pending requests with current and requested details side by side", () => {
    render(
      <BankDetailApprovals
        currentUserId="emp-pramod"
        initialRequests={[pendingRequest()]}
      />,
    );

    expect(screen.getByText("Current account")).toBeInTheDocument();
    expect(screen.getByText("Requested account")).toBeInTheDocument();
    expect(screen.getByText("90123456789012")).toBeInTheDocument();
    expect(screen.getByText("60123456789013")).toBeInTheDocument();
    expect(screen.getByText("ICIC0004567")).toBeInTheDocument();
    expect(screen.getByText("SBIN0002345")).toBeInTheDocument();
    expect(screen.getAllByText("Muhammad Shameel").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve change" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject change" })).toBeInTheDocument();
  });

  it("marks a first-time requester with no current account", () => {
    render(
      <BankDetailApprovals
        currentUserId="emp-pramod"
        initialRequests={[pendingRequest({ currentApproved: null })]}
      />,
    );

    expect(screen.getByText("No approved account yet. This is the employee's first request.")).toBeInTheDocument();
  });

  it("approves through the API and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bankChange: {} }) })
      .mockResolvedValueOnce(listResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BankDetailApprovals
        currentUserId="emp-pramod"
        initialRequests={[pendingRequest()]}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/finance/bank-detail-requests/bank-change-1/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText("No pending bank-detail change requests.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("approved");
  });

  it("rejects with a required reason through the API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ bankChange: {} }) })
      .mockResolvedValueOnce(listResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BankDetailApprovals
        currentUserId="emp-pramod"
        initialRequests={[pendingRequest()]}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reject change" }));
    });
    expect(screen.getByRole("button", { name: "Confirm rejection" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Account number does not match PAN records." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/finance/bank-detail-requests/bank-change-1/reject",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Account number does not match PAN records." }),
      }),
    );
    expect(await screen.findByText("No pending bank-detail change requests.")).toBeInTheDocument();
  });

  it("surfaces a server-side conflict message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "This bank-detail change request is already decided." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BankDetailApprovals
        currentUserId="emp-pramod"
        initialRequests={[pendingRequest()]}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Approve change" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This bank-detail change request is already decided.",
    );
  });

  it("hides the approve and reject actions for the viewer's own request", () => {
    render(
      <BankDetailApprovals
        currentUserId="emp-shameel"
        initialRequests={[pendingRequest()]}
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent("Your own change");
    expect(screen.queryByRole("button", { name: "Approve change" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject change" })).not.toBeInTheDocument();
  });
});
