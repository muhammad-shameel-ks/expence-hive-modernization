// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationActivity } from "./organization-activity";
import type { ActivityItem } from "@/features/dashboard/mock-data";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ITEM: ActivityItem = {
  id: "act-1",
  claimId: "exp-1",
  claimRef: "EXP-1001",
  claimTitle: "Flight ticket",
  claimCategory: "Travel",
  amount: 450,
  currency: "INR",
  requesterName: "Shameel",
  actorName: "Sanil",
  kind: "submitted",
  date: "Aug 5",
};

const EMPLOYEES: ExpenseEmployee[] = [
  {
    id: "emp-shameel",
    organizationId: "org-1",
    name: "Shameel",
    role: { id: "role-executive", code: "executive", displayName: "Executive" },
    active: true,
    managerId: null,
  },
  {
    id: "emp-sanil",
    organizationId: "org-1",
    name: "Sanil",
    role: { id: "role-manager", code: "manager", displayName: "Manager" },
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
];

// A claim mid-approval at the manager step, with a later Finance Head step
// still pending - the shape a Superadmin delegation would act on.
function inApprovalClaim(): ExpenseClaim {
  return {
    id: "exp-1",
    ref: "EXP-1001",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Flight ticket",
    category: "Travel",
    subCategory: "Flights",
    remark: "Client visit",
    amountMinor: 45000,
    currency: "INR",
    expenseDate: "2026-08-05",
    status: "in-approval",
    currentStage: "role-manager",
    currentActorId: "emp-sanil",
    steps: [
      { id: "s-1", roleId: "role-manager", assignedActorId: "emp-sanil", status: "pending" },
      { id: "s-2", roleId: "role-finance-head", assignedActorId: "emp-pramod", status: "pending" },
    ],
    history: [
      {
        id: "h-1",
        kind: "submitted",
        actorId: "emp-shameel",
        detail: "Sent for approval",
        createdAt: "2026-08-05T08:00:00.000Z",
      },
    ],
    version: 1,
    createdAt: "2026-08-05T08:00:00.000Z",
    submittedAt: "2026-08-05T08:00:00.000Z",
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ claim: inApprovalClaim(), employees: EMPLOYEES }), { status: 200 }),
    ),
  );
}

describe("OrganizationActivity delegation wiring", () => {
  it("shows the Delegate action for a Superadmin viewer opened from organization activity", async () => {
    stubFetch();
    render(
      <OrganizationActivity
        items={[ITEM]}
        currentUser="Super Boss"
        currentUserId="emp-super"
        currentUserRoleId="role-superadmin"
        currentUserRoleCode="superadmin"
      />,
    );

    fireEvent.click(screen.getByText("Flight ticket"));

    await waitFor(() => expect(screen.getByText("Delegate")).toBeInTheDocument());
  });

  it("does not show the Delegate action for a Finance Head viewer", async () => {
    stubFetch();
    render(
      <OrganizationActivity
        items={[ITEM]}
        currentUser="Pramod"
        currentUserId="emp-pramod"
        currentUserRoleId="role-finance-head"
        currentUserRoleCode="finance-head"
      />,
    );

    fireEvent.click(screen.getByText("Flight ticket"));

    await waitFor(() => expect(screen.getByText("EXP-1001")).toBeInTheDocument());
    expect(screen.queryByText("Delegate")).not.toBeInTheDocument();
  });

  it("does not show the Delegate action for the claim's own requester", async () => {
    stubFetch();
    render(
      <OrganizationActivity
        items={[ITEM]}
        currentUser="Shameel"
        currentUserId="emp-shameel"
        currentUserRoleId="role-executive"
        currentUserRoleCode="executive"
      />,
    );

    fireEvent.click(screen.getByText("Flight ticket"));

    await waitFor(() => expect(screen.getByText("EXP-1001")).toBeInTheDocument());
    expect(screen.queryByText("Delegate")).not.toBeInTheDocument();
  });
});
