import { describe, expect, it } from "vitest";
import { createExpenseCommands } from "./commands";
import {
  handleCreateExpenseRequest,
  handleFinancePaymentQueueRequest,
  handleSubmitExpenseRequest,
  handleUpdateCommentsRequest,
} from "./http";
import { InMemoryExpenseStore } from "./in-memory";

function build() {
  const store = new InMemoryExpenseStore({
    employees: [
      { id: "emp-shameel", organizationId: "org-1", name: "Muhammad Shameel", roleCodes: ["employee"], managerId: "emp-ada" },
      { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", roleCodes: ["manager"] },
      { id: "emp-it", organizationId: "org-1", name: "IT Head", roleCodes: ["it-reviewer"] },
      { id: "emp-ceo", organizationId: "org-1", name: "CEO", roleCodes: ["ceo"] },
      { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", roleCodes: ["finance-reviewer"] },
      { id: "emp-grace", organizationId: "org-1", name: "Grace Hopper", roleCodes: ["hr"] },
    ],
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
      claim: { status: "in-approval", currentStage: "manager" },
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
});
