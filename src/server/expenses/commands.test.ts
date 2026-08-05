import { describe, expect, it } from "vitest";
import { createExpenseCommands } from "./commands";
import { InMemoryExpenseStore } from "./in-memory";

const employee = {
  id: "emp-shameel",
  organizationId: "org-1",
  name: "Muhammad Shameel",
  roleCodes: ["employee"],
  managerId: "emp-ada",
};

function buildCommands() {
  return createExpenseCommands({
    store: new InMemoryExpenseStore({
      employees: [
        employee,
        { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", roleCodes: ["manager"] },
        { id: "emp-it", organizationId: "org-1", name: "IT Head", roleCodes: ["it-reviewer"] },
        { id: "emp-ceo", organizationId: "org-1", name: "CEO", roleCodes: ["ceo"] },
        { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", roleCodes: ["finance-reviewer"] },
        { id: "emp-grace", organizationId: "org-1", name: "Grace Hopper", roleCodes: ["hr"] },
      ],
    }),
    idFactory: (() => {
      let index = 0;
      return (prefix: string) => `${prefix}-${++index}`;
    })(),
    now: () => new Date("2026-08-04T10:00:00.000Z"),
  });
}

describe("expense commands", () => {
  it("creates a receipt-backed INR draft that the requester can retrieve", async () => {
    const commands = buildCommands();

    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
      attachment: {
        fileName: "flight-receipt.pdf",
        contentType: "application/pdf",
        storageKey: "prototype/flight-receipt.pdf",
      },
    });

    expect(draft).toMatchObject({
      id: "claim-1",
      status: "draft",
      title: "Bengaluru client flight",
      amountMinor: 1250000,
      currency: "INR",
      attachment: { fileName: "flight-receipt.pdf" },
    });
    await expect(commands.getClaim(employee.id, draft.id)).resolves.toMatchObject({
      id: draft.id,
      requesterId: employee.id,
      status: "draft",
    });
  });

  it("lets the requester see their own payout details on their claim", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });

    await expect(commands.getClaim(employee.id, draft.id)).resolves.toMatchObject({
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
  });

  it("hides payout details from an approver the claim is assigned to", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);

    const managerClaims = await commands.listClaims("emp-ada");

    expect(managerClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();
  });

  it("shows payout details to Finance once the claim reaches the finance stage, but not to IT or CEO along the way", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);

    const itClaims = await commands.listClaims("emp-it");
    expect(itClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();

    await commands.approveStage("emp-it", draft.id);
    const ceoClaims = await commands.listClaims("emp-ceo");
    expect(ceoClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();

    await commands.approveStage("emp-ceo", draft.id);
    const financeClaims = await commands.listClaims("emp-finance");
    expect(financeClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });
  });

  it("submits a draft into the configured manager, IT, CEO, and Finance route", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });

    const submitted = await commands.submitClaim(employee.id, draft.id);

    expect(submitted).toMatchObject({
      id: draft.id,
      status: "in-approval",
      currentStage: "manager",
      currentActorId: "emp-ada",
    });
    expect(submitted.steps.map((step) => step.stage)).toEqual([
      "manager",
      "it",
      "ceo",
      "finance",
    ]);
    expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted"]);
  });

  it("moves one claim through approval, Finance verification, and payment", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Conference taxi",
      category: "Travel",
      amountMinor: 85000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });
    await commands.submitClaim(employee.id, draft.id);

    await expect(commands.approveStage("emp-ada", draft.id)).resolves.toMatchObject({ currentStage: "it", currentActorId: "emp-it" });
    await expect(commands.approveStage("emp-it", draft.id)).resolves.toMatchObject({ currentStage: "ceo", currentActorId: "emp-ceo" });
    await expect(commands.approveStage("emp-ceo", draft.id)).resolves.toMatchObject({ status: "in-finance", currentStage: "finance", currentActorId: "emp-finance" });
    await expect(commands.verifyClaim("emp-finance", draft.id)).resolves.toMatchObject({ status: "in-finance" });
    const paid = await commands.markPaid("emp-finance", draft.id);

    expect(paid.status).toBe("paid");
    expect(paid.history.map((event) => event.kind)).toEqual(["draft", "submitted", "approved", "approved", "approved", "verified", "paid"]);
  });

  it("lists claims at or past the finance stage with payout details for Finance and HR, and rejects everyone else", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);
    await commands.approveStage("emp-it", draft.id);
    await commands.approveStage("emp-ceo", draft.id);

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });

    const hrQueue = await commands.listFinancePaymentQueue("emp-grace");
    expect(hrQueue.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });

    await expect(commands.listFinancePaymentQueue(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-it")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-ceo")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("prevents a requester from approving their own claim", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Self approval test",
      category: "Other",
      amountMinor: 10000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });
    await commands.submitClaim(employee.id, draft.id);

    await expect(commands.approveStage(employee.id, draft.id)).rejects.toMatchObject({ code: "unauthorized" });
  });
});
