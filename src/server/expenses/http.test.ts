import { describe, expect, it } from "vitest";
import { createExpenseCommands } from "./commands";
import {
  handleCreateExpenseRequest,
  handleFinancePaymentQueueRequest,
  handleGetExpenseRequest,
  handleRejectExpenseRequest,
  handleSubmitExpenseRequest,
  handleTakeOverExpenseRequest,
  handleUpdateCommentsRequest,
} from "./http";
import { InMemoryExpenseStore } from "./in-memory";

const ROLE_EMPLOYEE = { id: "role-employee", code: "employee", displayName: "Employee" };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager" };
const ROLE_IT = { id: "role-it-reviewer", code: "it-reviewer", displayName: "IT reviewer" };
const ROLE_FINANCE = { id: "role-finance-reviewer", code: "finance-reviewer", displayName: "Finance reviewer" };
const ROLE_HR = { id: "role-hr", code: "hr", displayName: "HR" };

function build() {
  const store = new InMemoryExpenseStore({
    employees: [
      { id: "emp-shameel", organizationId: "org-1", name: "Muhammad Shameel", role: ROLE_EMPLOYEE, managerId: "emp-ada" },
      { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER },
      { id: "emp-it", organizationId: "org-1", name: "IT Head", role: ROLE_IT },
      { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", role: ROLE_FINANCE },
      { id: "emp-grace", organizationId: "org-1", name: "Grace Hopper", role: ROLE_HR },
    ],
    flows: [{ id: "flow-standard", roleId: ROLE_EMPLOYEE.id, steps: [ROLE_MANAGER.id, ROLE_IT.id, ROLE_FINANCE.id] }],
  });
  const commands = createExpenseCommands({
    store,
    idFactory: (() => {
      let index = 0;
      return (prefix: string) => `${prefix}-${++index}`;
    })(),
    now: () => new Date("2026-08-04T10:00:00.000Z"),
  });
  return { commands };
}

describe("expense HTTP boundary", () => {
  it("creates a draft from rupee input and returns the persisted claim shape", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          attachment: { fileName: "receipt.jpg", contentType: "image/jpeg" },
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      claim: {
        status: "draft",
        amountMinor: 240000,
        currency: "INR",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        attachment: { fileName: "receipt.jpg" },
        payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
      },
    });
  });

  it("rejects a draft submitted without payout details", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          amount: "2400.00",
          expenseDate: "2026-08-04",
        }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a draft submitted with whitespace-only payout details", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "   ",
          ifscCode: "   ",
        }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
  });

  it("submits a draft through a protected command boundary", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Taxi",
          category: "Travel",
          subCategory: "Cab/Taxi",
          remark: "Airport pickup",
          amount: "850.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();

    const response = await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claim: { status: "in-approval", currentStage: ROLE_MANAGER.id },
    });
  });

  it("accepts an explicit skipped receipt from the receipt-first form", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "No receipt taxi",
          category: "Travel",
          subCategory: "Cab/Taxi",
          remark: "No receipt available",
          amount: "500.00",
          expenseDate: "2026-08-04",
          attachment: null,
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.claim.attachment).toBeUndefined();
  });

  it("serves the finance payment queue to Finance and rejects an employee", async () => {
    const { commands } = build();

    const okResponse = await handleFinancePaymentQueueRequest(
      new Request("http://localhost/api/expenses/finance-queue"),
      commands,
      "emp-finance",
    );
    expect(okResponse.status).toBe(200);
    await expect(okResponse.json()).resolves.toMatchObject({ claims: [] });

    const deniedResponse = await handleFinancePaymentQueueRequest(
      new Request("http://localhost/api/expenses/finance-queue"),
      commands,
      "emp-shameel",
    );
    expect(deniedResponse.status).toBe(403);
  });

  it("lets Finance add a comment to a claim and rejects an employee", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();

    const okResponse = await handleUpdateCommentsRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/comments`, {
        method: "PATCH",
        body: JSON.stringify({ comments: "Awaiting invoice copy" }),
      }),
      commands,
      "emp-finance",
      claim.id,
    );
    expect(okResponse.status).toBe(200);
    await expect(okResponse.json()).resolves.toMatchObject({ claim: { comments: "Awaiting invoice copy" } });

    const deniedResponse = await handleUpdateCommentsRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/comments`, {
        method: "PATCH",
        body: JSON.stringify({ comments: "Not allowed" }),
      }),
      commands,
      "emp-shameel",
      claim.id,
    );
    expect(deniedResponse.status).toBe(403);
  });

  it("lets a later-stage role take over a claim with a reason code", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Urgent client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          paymentMethod: "Personal card",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    const response = await handleTakeOverExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/take-over`, {
        method: "POST",
        body: JSON.stringify({ reasonCode: "Urgent payment deadline" }),
      }),
      commands,
      "emp-finance",
      claim.id,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claim: { status: "in-finance", currentStage: ROLE_FINANCE.id },
    });
  });

  it("rejects a take-over request without a reason code", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Urgent client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          paymentMethod: "Personal card",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    const response = await handleTakeOverExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/take-over`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      commands,
      "emp-finance",
      claim.id,
    );

    expect(response.status).toBe(422);
  });

  it("lets an assigned approver reject a claim outright with a reason", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    const response = await handleRejectExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "Missing itemized receipt" }),
      }),
      commands,
      "emp-ada",
      claim.id,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ claim: { status: "rejected" } });
  });

  it("rejects a rejection request without a reason", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    const response = await handleRejectExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/reject`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      commands,
      "emp-ada",
      claim.id,
    );

    expect(response.status).toBe(422);
  });

  it("returns the claim and organization employees for someone authorized to view it", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Conference taxi",
          category: "Travel",
          subCategory: "Cab/Taxi",
          remark: "Airport pickup",
          amount: "850.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );
    await commands.approveStage("emp-ada", claim.id);
    await commands.approveStage("emp-it", claim.id);

    // emp-ada is no longer assigned to this claim (it moved on to Finance),
    // but they approved it before, so they can still look it up.
    const response = await handleGetExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}`),
      commands,
      "emp-ada",
      claim.id,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claim).toMatchObject({ id: claim.id, status: "in-finance" });
    expect(body.employees.length).toBeGreaterThan(0);
  });

  it("denies viewing a claim to someone who never touched it and is not Finance/HR", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        }),
      }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await handleSubmitExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
      commands,
      "emp-shameel",
      claim.id,
    );

    const response = await handleGetExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}`),
      commands,
      "emp-it",
      claim.id,
    );

    expect(response.status).toBe(403);
  });
});
