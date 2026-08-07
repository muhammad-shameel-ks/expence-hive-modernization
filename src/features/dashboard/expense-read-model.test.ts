import { describe, expect, it } from "vitest";
import type { ExpenseClaim, ExpenseEmployee } from "@/server/expenses/ports";
import { claimToExpense } from "./expense-read-model";

const employees: ExpenseEmployee[] = [
  { id: "emp-shameel", organizationId: "org-1", name: "Muhammad Shameel", role: { id: "role-executive", code: "executive", displayName: "Executive" }, active: true, managerId: null },
  { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: { id: "role-manager", code: "manager", displayName: "Manager" }, active: true, managerId: null },
];

function rejectedClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: "claim-1",
    ref: "EXP-2026-0001",
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Client dinner",
    category: "Meals",
    subCategory: "",
    remark: "",
    amountMinor: 24000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "rejected",
    steps: [
      {
        id: "step-1",
        roleId: "role-manager",
        assignedActorId: "emp-ada",
        status: "rejected",
        decidedAt: "2026-08-05T09:00:00.000Z",
      },
    ],
    history: [
      { id: "h1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T09:00:00.000Z" },
      { id: "h2", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" },
      {
        id: "h3",
        kind: "rejected",
        actorId: "emp-ada",
        detail: "Missing itemized receipt",
        createdAt: "2026-08-05T09:00:00.000Z",
      },
    ],
    version: 3,
    createdAt: "2026-08-04T09:00:00.000Z",
    submittedAt: "2026-08-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("claimToExpense", () => {
  it("surfaces the rejection reason as the blocking reason on a rejected claim", () => {
    const expense = claimToExpense(rejectedClaim(), employees);

    expect(expense.status).toBe("rejected");
    expect(expense.blockingReason).toBe("Missing itemized receipt");
  });

  it("uses the latest rejection event when a claim was rejected more than once in its history", () => {
    const claim = rejectedClaim({
      history: [
        { id: "h1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T09:00:00.000Z" },
        { id: "h2", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" },
        {
          id: "h3",
          kind: "rejected",
          actorId: "emp-ada",
          detail: "First rejection",
          createdAt: "2026-08-05T09:00:00.000Z",
        },
        {
          id: "h4",
          kind: "rejected",
          actorId: "emp-finance",
          detail: "Final rejection",
          createdAt: "2026-08-06T09:00:00.000Z",
        },
      ],
    });

    const expense = claimToExpense(claim, employees);

    expect(expense.blockingReason).toBe("Final rejection");
  });

  it("leaves the blocking reason unset for claims that were not rejected", () => {
    const claim = rejectedClaim({
      status: "paid",
      steps: [{ id: "step-1", roleId: "role-manager", assignedActorId: "emp-ada", status: "paid" }],
      history: [
        { id: "h1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T09:00:00.000Z" },
        { id: "h2", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" },
        { id: "h3", kind: "approved", actorId: "emp-ada", createdAt: "2026-08-05T09:00:00.000Z" },
        { id: "h4", kind: "paid", actorId: "emp-finance", createdAt: "2026-08-06T09:00:00.000Z" },
      ],
    });

    const expense = claimToExpense(claim, employees);

    expect(expense.blockingReason).toBeUndefined();
  });

  it("labels a team-lead step with the Team lead name and surfaces it as the next stage", () => {
    const claim = rejectedClaim({
      status: "in-approval",
      currentStage: undefined,
      currentActorId: "emp-ada",
      steps: [
        { id: "step-1", roleId: null, assignedActorId: "emp-ada", status: "pending" },
        { id: "step-2", roleId: "role-finance-executive", assignedActorId: "emp-finance", status: "pending" },
      ],
      history: [
        { id: "h1", kind: "draft", actorId: "emp-shameel", createdAt: "2026-08-04T09:00:00.000Z" },
        { id: "h2", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" },
      ],
    });

    const expense = claimToExpense(claim, employees);

    expect(expense.nextStage).toBe("Team lead");
    expect(expense.steps?.[0]).toMatchObject({ roleId: null, roleName: "Team lead" });
    expect(expense.steps?.[1]).toMatchObject({ roleId: "role-finance-executive" });
  });

  it("marks the attachment as available only when it carries a stored digest", () => {
    const stored = claimToExpense(
      rejectedClaim({
        attachment: {
          id: "attachment-1",
          fileName: "receipt.jpg",
          contentType: "application/pdf",
          storageKey: "org-1/claim-1/attachment-1.jpg",
          status: "available",
          contentSha256: "abc123",
          sizeBytes: 10,
          uploadedAt: "2026-08-04T10:00:00.000Z",
        },
      }),
      employees,
    );
    const placeholder = claimToExpense(
      rejectedClaim({
        attachment: {
          id: "attachment-1",
          fileName: "legacy-receipt.jpg",
          contentType: "application/pdf",
          storageKey: "org-1/claim-1/attachment-1.jpg",
          status: "available",
          contentSha256: "",
          sizeBytes: 0,
          uploadedAt: "2026-08-04T10:00:00.000Z",
        },
      }),
      employees,
    );

    expect(stored.attachmentAvailable).toBe(true);
    expect(placeholder.attachmentAvailable).toBe(false);
  });
});
