import { describe, expect, it } from "vitest";
import { createExpenseCommands } from "./commands";
import { handleCreateExpenseRequest, handleSubmitExpenseRequest } from "./http";
import { InMemoryExpenseStore } from "./in-memory";

function build() {
  const store = new InMemoryExpenseStore({
    employees: [
      { id: "emp-shameel", organizationId: "org-1", name: "Muhammad Shameel", roleCodes: ["employee"], managerId: "emp-ada" },
      { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", roleCodes: ["manager"] },
      { id: "emp-it", organizationId: "org-1", name: "IT Head", roleCodes: ["it-reviewer"] },
      { id: "emp-ceo", organizationId: "org-1", name: "CEO", roleCodes: ["ceo"] },
      { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", roleCodes: ["finance-reviewer"] },
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
          amount: "2400.00",
          expenseDate: "2026-08-04",
          paymentMethod: "Personal card",
          attachment: { fileName: "receipt.jpg", contentType: "image/jpeg" },
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
        attachment: { fileName: "receipt.jpg" },
      },
    });
  });

  it("submits a draft through a protected command boundary", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          title: "Taxi",
          category: "Travel",
          amount: "850.00",
          expenseDate: "2026-08-04",
          paymentMethod: "Company card",
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
          amount: "500.00",
          expenseDate: "2026-08-04",
          paymentMethod: "Personal card",
          attachment: null,
        }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.claim.attachment).toBeUndefined();
  });
});
