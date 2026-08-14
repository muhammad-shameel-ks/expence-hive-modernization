// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/server/expenses/profile";
import type { BankDetails } from "@/server/expenses/ports";
import { ProfilePage } from "./profile-page";

const APPROVED_DETAILS: BankDetails = {
  holderName: "Muhammad Shameel",
  accountNumber: "90123456789012",
  ifsc: "ICIC0004567",
  bankName: "ICICI Bank",
  branch: "Koramangala",
};

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    employee: {
      id: "emp-shameel",
      organizationId: "org-1",
      name: "Muhammad Shameel",
      email: "shameel@hive.local",
      phone: "+91 98765 43210",
      departmentId: "dept-eng",
      departmentName: "Engineering",
      role: { id: "role-executive", code: "executive", displayName: "Executive" },
      active: true,
      managerId: "emp-ada",
    },
    department: "Engineering",
    manager: { id: "emp-ada", name: "Ada Lovelace" },
    approvedBankDetails: APPROVED_DETAILS,
    requests: [],
    ...overrides,
  };
}

function profileResponse(value: Profile) {
  return { ok: true, json: async () => ({ profile: value }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProfilePage identity", () => {
  it("renders the read-only identity: name, email, role, department, manager", () => {
    render(<ProfilePage initialProfile={profile()} />);

    expect(screen.getAllByText("Muhammad Shameel").length).toBeGreaterThan(0);
    expect(screen.getByText("shameel@hive.local")).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows placeholder text when identity pieces are missing", () => {
    render(
      <ProfilePage
        initialProfile={profile({ department: null, manager: null })}
      />,
    );

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});

describe("ProfilePage personal details", () => {
  it("pre-fills the phone field and saves it through the API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(profileResponse(profile()));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePage initialProfile={profile()} />);

    expect(screen.getByLabelText("Phone")).toHaveValue("+91 98765 43210");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save phone" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/personal",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "+91 98765 43210" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Phone number saved.");
  });

  it("shows the server validation error when the phone is malformed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Enter a valid phone number (6 to 20 digits, with optional +, -, parentheses, and spaces)." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePage initialProfile={profile()} />);

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "nope!" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save phone" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid phone number",
    );
  });
});

describe("ProfilePage bank details", () => {
  it("shows the currently approved account", () => {
    render(<ProfilePage initialProfile={profile()} />);

    expect(screen.getByText("Currently approved account")).toBeInTheDocument();
    expect(screen.getByText("90123456789012")).toBeInTheDocument();
    expect(screen.getByText("ICIC0004567")).toBeInTheDocument();
  });

  it("warns when no approved account exists yet", () => {
    render(
      <ProfilePage initialProfile={profile({ approvedBankDetails: null })} />,
    );

    expect(screen.getByText(/cannot submit expenses until an approved bank detail record exists/)).toBeInTheDocument();
  });

  it("submits a change request and then shows the pending state", async () => {
    const pending = profile({
      requests: [
        {
          id: "bank-change-1",
          organizationId: "org-1",
          employeeId: "emp-shameel",
          status: "pending",
          requested: {
            holderName: "Muhammad Shameel",
            accountNumber: "60123456789013",
            ifsc: "SBIN0002345",
            bankName: "State Bank of India",
            branch: "Whitefield",
          },
          requesterId: "emp-shameel",
          requestedAt: "2026-08-04T10:00:00.000Z",
          history: [{ id: "history-1", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue(profileResponse(pending));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePage initialProfile={profile()} />);

    fireEvent.change(screen.getByLabelText("Account holder name"), { target: { value: "Muhammad Shameel" } });
    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "60123456789013" } });
    fireEvent.change(screen.getByLabelText("IFSC"), { target: { value: "SBIN0002345" } });
    fireEvent.change(screen.getByLabelText("Bank name"), { target: { value: "State Bank of India" } });
    fireEvent.change(screen.getByLabelText("Branch"), { target: { value: "Whitefield" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/bank-details",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          holderName: "Muhammad Shameel",
          accountNumber: "60123456789013",
          ifsc: "SBIN0002345",
          bankName: "State Bank of India",
          branch: "Whitefield",
        }),
      }),
    );
    expect(await screen.findByRole("note")).toHaveTextContent(/pending approval/);
    expect(screen.queryByRole("button", { name: "Submit for approval" })).not.toBeInTheDocument();
  });

  it("surfaces the server-side format validation error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Enter a valid IFSC code: exactly 11 characters, 4 letters followed by 7 alphanumerics." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfilePage initialProfile={profile()} />);

    fireEvent.change(screen.getByLabelText("Account number"), { target: { value: "60123456789013" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid IFSC code/);
  });

  it("renders the change-request history with status and rejection reason", () => {
    render(
      <ProfilePage
        initialProfile={profile({
          requests: [
            {
              id: "bank-change-rejected",
              organizationId: "org-1",
              employeeId: "emp-shameel",
              status: "rejected",
              requested: {
                holderName: "Muhammad Shameel",
                accountNumber: "60123456789013",
                ifsc: "SBIN0002345",
                bankName: "State Bank of India",
                branch: "Whitefield",
              },
              requesterId: "emp-shameel",
              reviewerId: "emp-finance",
              rejectionReason: "Account number does not match PAN records.",
              requestedAt: "2026-08-02T10:00:00.000Z",
              reviewedAt: "2026-08-03T10:00:00.000Z",
              history: [
                { id: "history-1", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-02T10:00:00.000Z" },
                { id: "history-2", kind: "rejected", actorId: "emp-finance", actorName: "Rishikesh", detail: "Account number does not match PAN records.", createdAt: "2026-08-03T10:00:00.000Z" },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Rejection reason: Account number does not match PAN records.")).toBeInTheDocument();
    expect(screen.getByText(/Rejected by Rishikesh/)).toBeInTheDocument();
  });
});
