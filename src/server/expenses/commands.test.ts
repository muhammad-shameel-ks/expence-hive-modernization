import { describe, expect, it } from "vitest";
import { createExpenseCommands } from "./commands";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseEmployee, ExpenseFlow } from "./ports";

const ROLE_EMPLOYEE = { id: "role-employee", code: "employee", displayName: "Employee" };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager" };
const ROLE_IT = { id: "role-it-reviewer", code: "it-reviewer", displayName: "IT reviewer" };
const ROLE_FINANCE = { id: "role-finance-reviewer", code: "finance-reviewer", displayName: "Finance reviewer" };
const ROLE_HR = { id: "role-hr", code: "hr", displayName: "HR" };

const employee: ExpenseEmployee = {
  id: "emp-shameel",
  organizationId: "org-1",
  name: "Muhammad Shameel",
  role: ROLE_EMPLOYEE,
  managerId: "emp-ada",
};

const STANDARD_FLOW: ExpenseFlow = {
  id: "flow-standard",
  roleId: ROLE_EMPLOYEE.id,
  steps: [ROLE_MANAGER.id, ROLE_IT.id, ROLE_FINANCE.id],
};

function buildCommands(overrides: { employees?: ExpenseEmployee[]; flows?: ExpenseFlow[]; now?: () => Date } = {}) {
  return createExpenseCommands({
    store: new InMemoryExpenseStore({
      employees: overrides.employees ?? [
        employee,
        { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER },
        { id: "emp-it", organizationId: "org-1", name: "IT Head", role: ROLE_IT },
        { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", role: ROLE_FINANCE },
        { id: "emp-grace", organizationId: "org-1", name: "Grace Hopper", role: ROLE_HR },
      ],
      flows: overrides.flows ?? [STANDARD_FLOW],
    }),
    idFactory: (() => {
      let index = 0;
      return (prefix: string) => `${prefix}-${++index}`;
    })(),
    now: overrides.now ?? (() => new Date("2026-08-04T10:00:00.000Z")),
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
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);

    const managerClaims = await commands.listClaims("emp-ada");

    expect(managerClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();
  });

  it("shows payout details to Finance once the claim reaches the finance stage, but not to IT along the way", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);

    const itClaims = await commands.listClaims("emp-it");
    expect(itClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();

    await commands.approveStage("emp-it", draft.id);
    const financeClaims = await commands.listClaims("emp-finance");
    expect(financeClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });
  });

  it("submits a draft into the flow published for the requester's role", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    const submitted = await commands.submitClaim(employee.id, draft.id);

    expect(submitted).toMatchObject({
      id: draft.id,
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
      currentActorId: "emp-ada",
    });
    expect(submitted.steps.map((step) => step.roleId)).toEqual([ROLE_MANAGER.id, ROLE_IT.id, ROLE_FINANCE.id]);
    expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted"]);
  });

  it("routes approval to the manager of the requester's department for department-scoped roles", async () => {
    const engManager: ExpenseEmployee = {
      id: "emp-eng-mgr",
      organizationId: "org-1",
      name: "Eng Manager",
      departmentId: "dept-eng",
      role: { id: "role-mgr-eng", code: "manager", displayName: "Engineering Manager", departmentId: "dept-eng" },
    };
    const salesManager: ExpenseEmployee = {
      id: "emp-sales-mgr",
      organizationId: "org-1",
      name: "Sales Manager",
      departmentId: "dept-sales",
      role: { id: "role-mgr-sales", code: "manager", displayName: "Sales Manager", departmentId: "dept-sales" },
    };
    const engEmployee: ExpenseEmployee = {
      id: "emp-eng-user",
      organizationId: "org-1",
      name: "Shameel",
      departmentId: "dept-eng",
      role: { id: "role-emp", code: "employee", displayName: "Employee" },
    };

    const commands = buildCommands({
      employees: [engEmployee, engManager, salesManager],
      flows: [{ id: "flow-1", roleId: "role-emp", steps: ["role-mgr-eng"] }],
    });

    const draft = await commands.createDraft(engEmployee.id, {
      title: "Dev Server Hosting",
      category: "Infrastructure",
      amountMinor: 500000,
      currency: "INR",
      expenseDate: "2026-08-05",
      paymentMethod: "Personal card",
    });

    const submitted = await commands.submitClaim(engEmployee.id, draft.id);

    expect(submitted.currentActorId).toBe(engManager.id);
  });

  it("rejects submission when the requester has no role", async () => {
    const roleless: ExpenseEmployee = { id: "emp-roleless", organizationId: "org-1", name: "No Role", role: null };
    const commands = buildCommands({ employees: [roleless, { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER }] });
    const draft = await commands.createDraft(roleless.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });

    await expect(commands.submitClaim(roleless.id, draft.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects submission when no flow is published for the requester's role", async () => {
    const commands = buildCommands({ flows: [] });
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });

    await expect(commands.submitClaim(employee.id, draft.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("moves one claim through approval, Finance verification, and payment", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Conference taxi",
      category: "Travel",
      amountMinor: 85000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });
    await commands.submitClaim(employee.id, draft.id);

    await expect(commands.approveStage("emp-ada", draft.id)).resolves.toMatchObject({ currentStage: ROLE_IT.id, currentActorId: "emp-it" });
    await expect(commands.approveStage("emp-it", draft.id)).resolves.toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE.id, currentActorId: "emp-finance" });
    await expect(commands.verifyClaim("emp-finance", draft.id)).resolves.toMatchObject({ status: "in-finance" });
    const paid = await commands.markPaid("emp-finance", draft.id);

    expect(paid.status).toBe("paid");
    expect(paid.history.map((event) => event.kind)).toEqual(["draft", "submitted", "approved", "approved", "verified", "paid"]);
  });

  it("lists claims at or past the finance stage with payout details for Finance and HR, and rejects everyone else", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);
    await commands.approveStage("emp-it", draft.id);

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
  });

  it("captures sub category and remark on the draft and surfaces them on the finance queue", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });

    expect(draft).toMatchObject({ subCategory: "Airfare", remark: "Round trip for the Bengaluru client kickoff" });

    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);
    await commands.approveStage("emp-it", draft.id);

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)).toMatchObject({
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
    });
  });

  it("lets Finance and HR add comments to a claim, but rejects everyone else", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });

    const updated = await commands.updateComments("emp-finance", draft.id, "Awaiting invoice copy before payout");
    expect(updated.comments).toBe("Awaiting invoice copy before payout");

    await expect(commands.updateComments("emp-grace", draft.id, "HR follow-up note")).resolves.toMatchObject({
      comments: "HR follow-up note",
    });

    await expect(commands.updateComments(employee.id, draft.id, "Not allowed")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(commands.updateComments("emp-ada", draft.id, "Not allowed")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("records a comment as a history event, but does not duplicate it for an unchanged re-save", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    const commented = await commands.updateComments("emp-finance", draft.id, "Awaiting invoice copy");
    expect(commented.history.at(-1)).toMatchObject({ kind: "comment", actorId: "emp-finance", detail: "Awaiting invoice copy" });

    const resaved = await commands.updateComments("emp-finance", draft.id, "Awaiting invoice copy");
    expect(resaved.history.filter((event) => event.kind === "comment")).toHaveLength(1);
  });

  it("hides Finance/HR comments from an approver, but shows them to the owner", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
    });
    await commands.updateComments("emp-finance", draft.id, "Awaiting invoice copy before payout");
    await commands.submitClaim(employee.id, draft.id);

    const managerClaims = await commands.listClaims("emp-ada");
    expect(managerClaims.find((claim) => claim.id === draft.id)?.comments).toBeUndefined();

    const ownerClaim = await commands.getClaim(employee.id, draft.id);
    expect(ownerClaim.comments).toBe("Awaiting invoice copy before payout");
  });

  it("prevents a requester from approving their own claim", async () => {
    const commands = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Self approval test",
      category: "Other",
      amountMinor: 10000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });
    await commands.submitClaim(employee.id, draft.id);

    await expect(commands.approveStage(employee.id, draft.id)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("routes a requester's own approval stage around them, so they are never assigned their own claim", async () => {
    // emp-ada both requests and is the only Manager: the manager stage has no
    // eligible assignee other than the requester, so it must be treated as
    // vacant rather than assigned to the requester.
    const requester: ExpenseEmployee = { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER };
    const commands = buildCommands({
      employees: [
        requester,
        { id: "emp-it", organizationId: "org-1", name: "IT Head", role: ROLE_IT },
        { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", role: ROLE_FINANCE },
      ],
      flows: [{ id: "flow-manager", roleId: ROLE_MANAGER.id, steps: [ROLE_MANAGER.id, ROLE_IT.id, ROLE_FINANCE.id] }],
    });
    const draft = await commands.createDraft(requester.id, {
      title: "Manager's own expense",
      category: "Travel",
      amountMinor: 10000,
      currency: "INR",
      expenseDate: "2026-08-04",
      paymentMethod: "Personal card",
    });

    const submitted = await commands.submitClaim(requester.id, draft.id);

    expect(submitted.steps[0].assignedActorId).toBeUndefined();
  });

  describe("absence auto-skip", () => {
    it("auto-skips a vacant stage immediately on submission", async () => {
      const commands = buildCommands({
        employees: [employee, { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", role: ROLE_FINANCE }],
        flows: [{ id: "flow-standard", roleId: ROLE_EMPLOYEE.id, steps: [ROLE_MANAGER.id, ROLE_FINANCE.id] }],
      });
      const draft = await commands.createDraft(employee.id, {
        title: "No manager available",
        category: "Travel",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });

      const submitted = await commands.submitClaim(employee.id, draft.id);

      expect(submitted).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE.id, currentActorId: "emp-finance" });
      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted", "skipped"]);
    });

    it("auto-skips a stage whose assigned actor has not responded within 3 days", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const commands = buildCommands({ now: () => clock });
      const draft = await commands.createDraft(employee.id, {
        title: "Slow manager",
        category: "Travel",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      clock = new Date("2026-08-07T09:59:00.000Z");
      await expect(commands.getClaim(employee.id, draft.id)).resolves.toMatchObject({ currentStage: ROLE_MANAGER.id });

      clock = new Date("2026-08-07T10:00:01.000Z");
      const afterTimeout = await commands.getClaim(employee.id, draft.id);

      expect(afterTimeout).toMatchObject({ currentStage: ROLE_IT.id, currentActorId: "emp-it" });
      expect(afterTimeout.history.map((event) => event.kind)).toEqual(["draft", "submitted", "skipped"]);
    });

    it("never auto-skips the terminal stage even when it is vacant", async () => {
      const commands = buildCommands({
        employees: [employee, { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER }],
        flows: [{ id: "flow-standard", roleId: ROLE_EMPLOYEE.id, steps: [ROLE_MANAGER.id, ROLE_FINANCE.id] }],
      });
      const draft = await commands.createDraft(employee.id, {
        title: "No finance reviewer exists",
        category: "Travel",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      const afterApproval = await commands.approveStage("emp-ada", draft.id);

      expect(afterApproval).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE.id, currentActorId: undefined });
      expect(afterApproval.steps.at(-1)).toMatchObject({ status: "pending" });
    });
  });

  describe("hierarchy override takeover", () => {
    it("lets a later-stage role skip earlier pending stages with a reason code", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Urgent client dinner",
        category: "Meals",
        amountMinor: 50000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      const takenOver = await commands.takeOverClaim("emp-finance", draft.id, "Urgent payment deadline");

      expect(takenOver).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE.id, currentActorId: "emp-finance" });
      expect(takenOver.steps[0]).toMatchObject({ status: "skipped" });
      expect(takenOver.steps[1]).toMatchObject({ status: "skipped" });
      const overrideEvent = takenOver.history.find((event) => event.kind === "takeover");
      expect(overrideEvent).toMatchObject({ actorId: "emp-finance" });
      expect(overrideEvent?.detail).toContain("Urgent payment deadline");
    });

    it("requires a non-empty reason code", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Urgent client dinner",
        category: "Meals",
        amountMinor: 50000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.takeOverClaim("emp-finance", draft.id, "   ")).rejects.toMatchObject({ code: "validation" });
    });

    it("rejects a takeover from a role with no later step in the flow", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Urgent client dinner",
        category: "Meals",
        amountMinor: 50000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.takeOverClaim("emp-grace", draft.id, "Not eligible")).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("prevents a requester from taking over their own claim", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Self takeover test",
        category: "Other",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        paymentMethod: "Personal card",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.takeOverClaim(employee.id, draft.id, "Any reason")).rejects.toMatchObject({ code: "unauthorized" });
    });
  });

  describe("rejection", () => {
    it("lets an assigned approver reject a claim outright, terminating it immediately", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "USB-C hub",
        category: "Hardware",
        amountMinor: 7600,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      const rejected = await commands.rejectClaim("emp-ada", draft.id, "Missing itemized receipt");

      expect(rejected).toMatchObject({ status: "rejected", currentStage: undefined, currentActorId: undefined });
      expect(rejected.steps[0]).toMatchObject({ status: "rejected" });
      expect(rejected.history.at(-1)).toMatchObject({ kind: "rejected", actorId: "emp-ada", detail: "Missing itemized receipt" });
    });

    it("lets Finance reject a claim outright instead of sending it back for correction", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.approveStage("emp-ada", draft.id);
      await commands.approveStage("emp-it", draft.id);

      const rejected = await commands.rejectClaim("emp-finance", draft.id, "Payout details missing IFSC code");

      expect(rejected.status).toBe("rejected");
      expect(rejected.steps.at(-1)).toMatchObject({ status: "rejected" });
    });

    it("requires a non-empty reason", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.rejectClaim("emp-ada", draft.id, "   ")).rejects.toMatchObject({ code: "validation" });
    });

    it("accepts a rejection reason longer than 200 characters", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      const longReason = `The expense form is missing both the itemized receipt and the GST invoice, and the vendor's name does not match the bank statement. ${"x".repeat(200)}`;

      const rejected = await commands.rejectClaim("emp-ada", draft.id, longReason);

      expect(rejected.status).toBe("rejected");
      expect(rejected.history.at(-1)).toMatchObject({ kind: "rejected", detail: longReason });
    });

    it("rejects rejection from someone the claim is not assigned to", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.rejectClaim("emp-it", draft.id, "Not my stage")).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("does not allow a rejected claim to be edited, approved, or resubmitted", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Not eligible for reimbursement");

      // The claim has no current stage or actor anymore, so it is no longer
      // assigned to anyone and cannot be acted on again.
      await expect(commands.rejectClaim("emp-ada", draft.id, "Again")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.approveStage("emp-ada", draft.id)).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("lets the employee submit a new, distinct claim for the same expense after a rejection, restarting at the first stage while the rejected claim's history stays unchanged", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Not eligible for reimbursement");

      const newDraft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      const submitted = await commands.submitClaim(employee.id, newDraft.id);

      expect(submitted.id).not.toBe(draft.id);
      expect(submitted).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada",
      });
      expect(submitted.steps.map((step) => step.status)).toEqual(["pending", "pending", "pending"]);
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted"]);

      const rejected = await commands.getClaim(employee.id, draft.id);
      expect(rejected.status).toBe("rejected");
      expect(rejected.history.map((event) => event.kind)).toEqual(["draft", "submitted", "rejected"]);
      expect(rejected.history.at(-1)).toMatchObject({ kind: "rejected", detail: "Not eligible for reimbursement" });
    });

    it("does not allow comments on a rejected claim", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Not eligible for reimbursement");

      await expect(commands.updateComments("emp-finance", draft.id, "Follow-up note")).rejects.toMatchObject({
        code: "conflict",
      });
      await expect(commands.updateComments("emp-grace", draft.id, "HR follow-up note")).rejects.toMatchObject({
        code: "conflict",
      });
    });
  });

  describe("claim visibility for getClaim", () => {
    it("lets an approver view a claim's detail after it has moved past their stage", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Conference taxi",
        category: "Travel",
        amountMinor: 85000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.approveStage("emp-ada", draft.id);
      await commands.approveStage("emp-it", draft.id);

      const managerClaims = await commands.listClaims("emp-ada");
      expect(managerClaims.find((claim) => claim.id === draft.id)).toBeUndefined();

      await expect(commands.getClaim("emp-ada", draft.id)).resolves.toMatchObject({ id: draft.id });
    });

    it("lets Finance and HR view any claim in the organization", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      await expect(commands.getClaim("emp-finance", draft.id)).resolves.toMatchObject({ id: draft.id });
      await expect(commands.getClaim("emp-grace", draft.id)).resolves.toMatchObject({ id: draft.id });
    });

    it("denies an employee who never touched the claim and is not Finance/HR", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.getClaim("emp-it", draft.id)).rejects.toMatchObject({ code: "unauthorized" });
    });
  });

  describe("activity feed", () => {
    it("keeps a decision visible in the actor's activity feed after the claim moves past their stage", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Conference taxi",
        category: "Travel",
        amountMinor: 85000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.approveStage("emp-ada", draft.id);
      // Advance the claim well past the manager stage: emp-ada should no
      // longer see it in their workspace, but it must still show up in their
      // activity feed.
      await commands.approveStage("emp-it", draft.id);

      const managerClaims = await commands.listClaims("emp-ada");
      expect(managerClaims.find((claim) => claim.id === draft.id)).toBeUndefined();

      const activity = await commands.listActivity("emp-ada");
      expect(activity).toEqual([
        expect.objectContaining({ claimId: draft.id, claimRef: draft.ref, kind: "approved" }),
      ]);
    });

    it("includes rejections and comments, but not drafts, submissions, or skips", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Missing itemized receipt");

      const employeeActivity = await commands.listActivity(employee.id);
      expect(employeeActivity).toEqual([]);

      const managerActivity = await commands.listActivity("emp-ada");
      expect(managerActivity).toEqual([
        expect.objectContaining({ claimId: draft.id, kind: "rejected", detail: "Missing itemized receipt" }),
      ]);
    });

    it("lets Finance and HR view another employee's activity, but not an ordinary employee", async () => {
      const commands = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Missing itemized receipt");

      await expect(commands.listActivity("emp-finance", "emp-ada")).resolves.toEqual([
        expect.objectContaining({ claimId: draft.id, kind: "rejected" }),
      ]);
      await expect(commands.listActivity("emp-grace", "emp-ada")).resolves.toEqual([
        expect.objectContaining({ claimId: draft.id, kind: "rejected" }),
      ]);
      await expect(commands.listActivity(employee.id, "emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
    });
  });

  describe("organization-wide activity feed", () => {
    const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head" };

    function buildWithFinanceHead() {
      return buildCommands({
        employees: [
          employee,
          { id: "emp-ada", organizationId: "org-1", name: "Ada Lovelace", role: ROLE_MANAGER },
          { id: "emp-it", organizationId: "org-1", name: "IT Head", role: ROLE_IT },
          { id: "emp-finance", organizationId: "org-1", name: "Finance Officer", role: ROLE_FINANCE },
          { id: "emp-pramod", organizationId: "org-1", name: "Pramod", role: ROLE_FINANCE_HEAD },
        ],
      });
    }

    it("lets Finance Head see decisions made by anyone in the organization", async () => {
      const commands = buildWithFinanceHead();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Missing itemized receipt");

      const activity = await commands.listOrganizationActivity("emp-pramod");
      expect(activity).toEqual([
        expect.objectContaining({ claimId: draft.id, kind: "rejected", actorId: "emp-ada", actorName: "Ada Lovelace" }),
      ]);
    });

    it("denies the organization activity feed to Finance reviewer, HR, and ordinary employees", async () => {
      const commands = buildWithFinanceHead();

      await expect(commands.listOrganizationActivity("emp-finance")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.listOrganizationActivity(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("gives Finance Head the same standing oversight as Finance and HR: payout details, comments, and any employee's activity", async () => {
      const commands = buildWithFinanceHead();
      const draft = await commands.createDraft(employee.id, {
        title: "Bengaluru client flight",
        category: "Travel",
        amountMinor: 1250000,
        currency: "INR",
        expenseDate: "2026-08-04",
        payoutDetails: { accountNumber: "32534240620", ifscCode: "SBIN0012861" },
      });

      const commented = await commands.updateComments("emp-pramod", draft.id, "Approved for payout");
      expect(commented.comments).toBe("Approved for payout");
      expect(commented.payoutDetails).toEqual({ accountNumber: "32534240620", ifscCode: "SBIN0012861" });

      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Missing itemized receipt");
      await expect(commands.listActivity("emp-pramod", "emp-ada")).resolves.toEqual([
        expect.objectContaining({ claimId: draft.id, kind: "rejected" }),
      ]);
    });
  });
});
