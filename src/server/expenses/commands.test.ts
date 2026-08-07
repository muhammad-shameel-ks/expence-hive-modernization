import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "../blob/fakes";
import type { BlobStore } from "../blob/ports";
import { createExpenseCommands } from "./commands";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseEmployee, ExpenseFlow, FlowStepTarget } from "./ports";
import { MAX_RECEIPT_SIZE_BYTES } from "./receipt-validation";

const ROLE_EXECUTIVE = { id: "role-executive", code: "executive", displayName: "Executive" };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager" };
const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head" };
const ROLE_FINANCE_EXECUTIVE = { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive" };
const ROLE_TEAM_LEAD = { id: "role-team-lead", code: "team-lead", displayName: "Team Lead" };
const ROLE_INTERN = { id: "role-intern", code: "intern", displayName: "Intern" };

const roleStep = (roleId: string): FlowStepTarget => ({ kind: "role", roleId });
const TEAM_LEAD_STEP: FlowStepTarget = { kind: "team-lead" };

const employee: ExpenseEmployee = {
  id: "emp-shameel",
  organizationId: "org-1",
  name: "Muhammad Shameel",
  departmentId: "dept-eng",
  role: ROLE_EXECUTIVE,
  active: true,
  managerId: "emp-ada",
};

const STANDARD_FLOW: ExpenseFlow = {
  id: "flow-standard",
  roleId: ROLE_EXECUTIVE.id,
  steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
};

function emp(
  id: string,
  name: string,
  role: ExpenseEmployee["role"],
  extra: Partial<ExpenseEmployee> = {},
): ExpenseEmployee {
  return { id, organizationId: "org-1", name, role, active: true, managerId: null, ...extra };
}

const BASE_EMPLOYEES: ExpenseEmployee[] = [
  employee,
  emp("emp-katherine", "Katherine Johnson", ROLE_EXECUTIVE, { departmentId: "dept-eng" }),
  emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
  emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
  emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
];

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

const PDF_RECEIPT: Uint8Array = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a); // "%PDF-1.4\n"
const JPEG_RECEIPT: Uint8Array = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46);

function buildCommands(overrides: { employees?: ExpenseEmployee[]; flows?: ExpenseFlow[]; now?: () => Date; blobStore?: BlobStore } = {}) {
  const store = new InMemoryExpenseStore({
    employees: overrides.employees ?? BASE_EMPLOYEES,
    flows: overrides.flows ?? [STANDARD_FLOW],
  });
  const blobStore = overrides.blobStore ?? new InMemoryBlobStore();
  return {
    store,
    blobStore,
    commands: createExpenseCommands({
      store,
      blobStore,
      idFactory: (() => {
        const counters = new Map<string, number>();
        return (prefix: string) => {
          const next = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, next);
          return `${prefix}-${next}`;
        };
      })(),
      now: overrides.now ?? (() => new Date("2026-08-04T10:00:00.000Z")),
    }),
  };
}

async function submitStandardDraft(commands: ReturnType<typeof buildCommands>["commands"], actorId = employee.id) {
  const draft = await commands.createDraft(actorId, {
    title: "Client dinner",
    category: "Meals",
    amountMinor: 240000,
    currency: "INR",
    expenseDate: "2026-08-04",
  });
  return commands.submitClaim(actorId, draft.id);
}

describe("expense commands", () => {
  it("creates a receipt-backed INR draft that the requester can retrieve", async () => {
    const { commands, blobStore } = buildCommands();

    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: {
        fileName: "flight-receipt.pdf",
        contentType: "application/pdf",
        data: PDF_RECEIPT,
      },
    });

    expect(draft).toMatchObject({
      id: "claim-1",
      status: "draft",
      title: "Bengaluru client flight",
      amountMinor: 1250000,
      currency: "INR",
      attachment: {
        id: "attachment-1",
        fileName: "flight-receipt.pdf",
        contentType: "application/pdf",
        storageKey: "org-1/claim-1/attachment-1.pdf",
        status: "available",
        sizeBytes: PDF_RECEIPT.byteLength,
        uploadedAt: "2026-08-04T10:00:00.000Z",
      },
    });
    expect(draft.attachment?.contentSha256).toBe(createHash("sha256").update(PDF_RECEIPT).digest("hex"));
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toEqual({
      data: PDF_RECEIPT,
      contentType: "application/pdf",
    });
    await expect(commands.getClaim(employee.id, draft.id)).resolves.toMatchObject({
      id: draft.id,
      requesterId: employee.id,
      status: "draft",
    });
  });

  it("sniffs the format when the declared type is the octet-stream absence placeholder", async () => {
    const { commands, blobStore } = buildCommands();

    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: {
        fileName: "scan.bin",
        contentType: "application/octet-stream",
        data: PDF_RECEIPT,
      },
    });

    expect(draft.attachment).toMatchObject({
      fileName: "scan.bin",
      contentType: "application/pdf",
      storageKey: "org-1/claim-1/attachment-1.pdf",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toEqual({
      data: PDF_RECEIPT,
      contentType: "application/pdf",
    });
  });

  it("sniffs the format for an attachment with an empty declared content type", async () => {
    const { commands, blobStore } = buildCommands();

    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: {
        fileName: "scan.pdf",
        contentType: "",
        data: PDF_RECEIPT,
      },
    });

    expect(draft.attachment).toMatchObject({
      fileName: "scan.pdf",
      contentType: "application/pdf",
      storageKey: "org-1/claim-1/attachment-1.pdf",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toEqual({
      data: PDF_RECEIPT,
      contentType: "application/pdf",
    });
  });

  it("persists nothing when the blob write fails", async () => {
    const { store, blobStore, commands } = buildCommands();
    vi.spyOn(blobStore, "putBlob").mockRejectedValue(new Error("blob storage unavailable"));

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "scan.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      }),
    ).rejects.toThrow("blob storage unavailable");
    await expect(store.getClaim("claim-1")).resolves.toBeNull();
  });

  it("deletes the blob best-effort when the claim insert fails, and propagates the error", async () => {
    const { store, blobStore, commands } = buildCommands();
    vi.spyOn(store, "createClaim").mockRejectedValue(new Error("database unavailable"));

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "scan.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      }),
    ).rejects.toThrow("database unavailable");
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
  });

  it("rejects an oversized receipt without touching the blob store", async () => {
    const { commands, blobStore } = buildCommands();
    const bigReceipt = new Uint8Array(MAX_RECEIPT_SIZE_BYTES + 1);
    bigReceipt.set(PDF_RECEIPT);

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "huge.pdf", contentType: "application/pdf", data: bigReceipt },
      }),
    ).rejects.toMatchObject({
      code: "too-large",
      message: "The receipt is larger than 10 MB.",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
  });

  it("rejects a declared PNG whose bytes are actually a JPEG", async () => {
    const { commands, blobStore } = buildCommands();

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "photo.png", contentType: "image/png", data: JPEG_RECEIPT },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "Receipts must be a JPEG, PNG, or PDF file.",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.jpg")).resolves.toBeNull();
  });

  it("rejects receipt bytes that match no known format", async () => {
    const { commands, blobStore } = buildCommands();

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: {
          fileName: "mystery.bin",
          contentType: "application/pdf",
          data: bytes(0x00, 0x01, 0x02, 0x03, 0x04),
        },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "Receipts must be a JPEG, PNG, or PDF file.",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
  });

  it("lets the requester see their own payout details on their claim", async () => {
    const { commands } = buildCommands();
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
    const { commands } = buildCommands();
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

  it("shows payout details to Finance roles from their stage on, but not to ordinary approvers", async () => {
    const { commands } = buildCommands();
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

    const managerClaims = await commands.listClaims("emp-ada");
    expect(managerClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toBeUndefined();

    const financeHeadClaims = await commands.listClaims("emp-pramod");
    expect(financeHeadClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });

    await commands.approveStage("emp-pramod", draft.id);
    const financeClaims = await commands.listClaims("emp-finance");
    expect(financeClaims.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });
  });

  it("submits a draft into the flow published for the requester's role", async () => {
    const { commands } = buildCommands();

    const submitted = await submitStandardDraft(commands);

    expect(submitted).toMatchObject({
      id: "claim-1",
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
      currentActorId: "emp-ada",
    });
    expect(submitted.steps.map((step) => step.roleId)).toEqual([ROLE_MANAGER.id, ROLE_FINANCE_HEAD.id, ROLE_FINANCE_EXECUTIVE.id]);
    expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted"]);
  });

  describe("routing resolution", () => {
    it("assigns the first eligible Manager in the requester's department", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-sanil", "Sanil Davis", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-arun", "Arun Kumar", ROLE_MANAGER, { departmentId: "dept-ops" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
      });

      const submitted = await submitStandardDraft(commands);

      expect(submitted.steps[0]).toMatchObject({ roleId: ROLE_MANAGER.id, assignedActorId: "emp-ada" });
    });

    it("lets any Manager-role holder in the requester's department approve the stage (pool), without needing both", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-sanil", "Sanil Davis", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
      });
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      // The second department manager completes the pool stage on their own.
      const approved = await commands.approveStage("emp-sanil", draft.id);

      expect(approved).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
      expect(approved.steps[0]).toMatchObject({ status: "approved", assignedActorId: "emp-ada" });

      // The first manager's approval is no longer actionable: the stage is
      // complete, and they are not eligible for the Finance Head stage.
      await expect(commands.approveStage("emp-ada", draft.id)).rejects.toMatchObject({
        code: "unauthorized",
      });
    });

    it("rejects a Manager from another department who tries to approve the stage", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-arun", "Arun Kumar", ROLE_MANAGER, { departmentId: "dept-ops" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
      });
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(employee.id, draft.id);

      await expect(commands.approveStage("emp-arun", draft.id)).rejects.toMatchObject({
        code: "unauthorized",
      });
    });

    it("treats a Manager step as vacant when the requester has no department", async () => {
      const noDeptRequester: ExpenseEmployee = {
        ...employee,
        id: "emp-roleless-dept",
        name: "No Department",
        departmentId: null,
        role: ROLE_EXECUTIVE,
      };
      const { commands } = buildCommands({
        employees: [
          noDeptRequester,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          { id: "flow-no-dept", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });

      const submitted = await submitStandardDraft(commands, noDeptRequester.id);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped", assignedActorId: undefined });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
    });

    it("resolves Finance Head and Finance Executive steps org-wide, regardless of department", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-ops" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-eng" }),
        ],
      });

      const submitted = await submitStandardDraft(commands);
      const afterManager = await commands.approveStage("emp-ada", submitted.id);
      const afterHead = await commands.approveStage("emp-pramod", afterManager.id);

      expect(afterManager).toMatchObject({ currentActorId: "emp-pramod" });
      expect(afterHead).toMatchObject({ status: "in-finance", currentActorId: "emp-finance" });
    });

    it("routes an intern's claim to their assigned team lead, who approves regardless of their own role", async () => {
      const intern: ExpenseEmployee = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: "emp-abilash",
      });
      const abilash: ExpenseEmployee = emp("emp-abilash", "Abilash", ROLE_TEAM_LEAD, {
        departmentId: "dept-eng",
      });
      const { commands } = buildCommands({
        employees: [
          intern,
          abilash,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          {
            id: "flow-intern",
            roleId: ROLE_INTERN.id,
            steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern cab ride",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      const submitted = await commands.submitClaim(intern.id, draft.id);

      expect(submitted.steps[0]).toMatchObject({ roleId: null, assignedActorId: "emp-abilash" });
      expect(submitted).toMatchObject({ status: "in-approval", currentStage: undefined, currentActorId: "emp-abilash" });

      // The assigned named person approves even though their role is not
      // the step's target.
      const approved = await commands.approveStage("emp-abilash", draft.id);

      expect(approved.steps[0]).toMatchObject({ status: "approved" });
      expect(approved).toMatchObject({ currentStage: ROLE_MANAGER.id, currentActorId: "emp-ada" });
    });

    it("does not let an employee other than the assigned team lead approve the team-lead step", async () => {
      const intern: ExpenseEmployee = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: "emp-abilash",
      });
      const { commands } = buildCommands({
        employees: [
          intern,
          emp("emp-abilash", "Abilash", ROLE_TEAM_LEAD, { departmentId: "dept-eng" }),
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          {
            id: "flow-intern",
            roleId: ROLE_INTERN.id,
            steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern cab ride",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(intern.id, draft.id);

      await expect(commands.approveStage("emp-ada", draft.id)).rejects.toMatchObject({
        code: "unauthorized",
      });
    });

    it("auto-skips an intern's team-lead step when the intern has no assigned manager", async () => {
      const intern: ExpenseEmployee = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: null,
      });
      const { commands } = buildCommands({
        employees: [
          intern,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          {
            id: "flow-intern",
            roleId: ROLE_INTERN.id,
            steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern cab ride",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      const submitted = await commands.submitClaim(intern.id, draft.id);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped", roleId: null });
      expect(submitted).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada",
      });
    });

    it("excludes inactive employees from eligibility and assigns an active holder instead", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng", active: false }),
          emp("emp-sanil", "Sanil Davis", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
      });

      const submitted = await submitStandardDraft(commands);

      expect(submitted.steps[0]).toMatchObject({ assignedActorId: "emp-sanil" });
    });

    it("auto-skips a role stage when its only holders are inactive", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng", active: false }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          { id: "flow-short", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });

      const submitted = await submitStandardDraft(commands);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped", assignedActorId: undefined });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
    });

    it("treats an assigned actor who is deactivated mid-flow as vacant and auto-skips the stage", async () => {
      const { store, commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      expect(submitted.steps[0]).toMatchObject({ assignedActorId: "emp-ada", status: "pending" });

      store.setEmployeeActive("emp-ada", false);

      const afterDeactivation = await commands.getClaim(employee.id, submitted.id);

      expect(afterDeactivation.steps[0]).toMatchObject({ status: "skipped" });
      expect(afterDeactivation).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
      const skippedEvent = afterDeactivation.history.find((event) => event.kind === "skipped");
      expect(skippedEvent?.detail).toBe("Skipped: no active employee holds this stage");
    });

    it("rejects every command entry point for an inactive employee", async () => {
      const inactive: ExpenseEmployee = emp("emp-gone", "Gone Person", ROLE_EXECUTIVE, { active: false });
      const { commands } = buildCommands({ employees: [inactive, ...BASE_EMPLOYEES.slice(1)] });

      await expect(
        commands.createDraft(inactive.id, {
          title: "Client dinner",
          category: "Meals",
          amountMinor: 240000,
          currency: "INR",
          expenseDate: "2026-08-04",
        }),
      ).rejects.toMatchObject({ code: "unauthorized", message: "The current user is not an active employee." });
      await expect(commands.listClaims(inactive.id)).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.submitClaim(inactive.id, "claim-1")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.approveStage(inactive.id, "claim-1")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.takeOverClaim(inactive.id, "claim-1", "Urgent")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.listFinancePaymentQueue(inactive.id)).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("rejects submission when the role has no published flow, even if another role's flow exists", async () => {
      const { commands } = buildCommands({
        flows: [{ id: "flow-other-role", roleId: ROLE_MANAGER.id, steps: [roleStep(ROLE_FINANCE_EXECUTIVE.id)] }],
      });
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      await expect(commands.submitClaim(employee.id, draft.id)).rejects.toMatchObject({
        code: "validation",
        message: "No approval flow is published for your role yet.",
      });
    });
  });

  it("rejects submission when the requester has no role", async () => {
    const roleless: ExpenseEmployee = emp("emp-roleless", "No Role", null);
    const { commands } = buildCommands({
      employees: [roleless, emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" })],
    });
    const draft = await commands.createDraft(roleless.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.submitClaim(roleless.id, draft.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects submission when no flow is published for the requester's role", async () => {
    const { commands } = buildCommands({ flows: [] });
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.submitClaim(employee.id, draft.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("moves one claim through approval, Finance verification, and payment", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.approveStage("emp-ada", submitted.id)).resolves.toMatchObject({ currentStage: ROLE_FINANCE_HEAD.id, currentActorId: "emp-pramod" });
    await expect(commands.approveStage("emp-pramod", submitted.id)).resolves.toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE_EXECUTIVE.id, currentActorId: "emp-finance" });
    await expect(commands.verifyClaim("emp-finance", submitted.id)).resolves.toMatchObject({ status: "in-finance" });
    const paid = await commands.markPaid("emp-finance", submitted.id);

    expect(paid.status).toBe("paid");
    expect(paid.history.map((event) => event.kind)).toEqual(["draft", "submitted", "approved", "approved", "verified", "paid"]);
  });

  it("lists claims at or past the finance stage with payout details for Finance, and rejects everyone else", async () => {
    const { commands } = buildCommands();
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
    await commands.approveStage("emp-pramod", draft.id);

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)?.payoutDetails).toEqual({
      accountNumber: "32534240620",
      ifscCode: "SBIN0012861",
    });

    await expect(commands.listFinancePaymentQueue(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-katherine")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("captures sub category and remark on the draft and surfaces them on the finance queue", async () => {
    const { commands } = buildCommands();
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
    await commands.approveStage("emp-pramod", draft.id);

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)).toMatchObject({
      subCategory: "Airfare",
      remark: "Round trip for the Bengaluru client kickoff",
    });
  });

  it("lets Finance add comments to a claim, but rejects everyone else", async () => {
    const { commands } = buildCommands();
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

    await expect(commands.updateComments(employee.id, draft.id, "Not allowed")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(commands.updateComments("emp-ada", draft.id, "Not allowed")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("records a comment as a history event, but does not duplicate it for an unchanged re-save", async () => {
    const { commands } = buildCommands();
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

  it("hides Finance comments from an approver, but shows them to the owner", async () => {
    const { commands } = buildCommands();
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
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.approveStage(employee.id, submitted.id)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("routes a requester's own approval stage around them, so they are never assigned their own claim", async () => {
    // emp-ada both requests and is the only Manager: the manager stage has
    // no eligible assignee other than the requester (and no manager is
    // eligible for a requester without a department), so it must be treated
    // as vacant rather than assigned to the requester.
    const requester: ExpenseEmployee = emp("emp-ada", "Ada Lovelace", ROLE_MANAGER);
    const { commands } = buildCommands({
      employees: [
        requester,
        emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
        emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
      ],
      flows: [
        { id: "flow-manager", roleId: ROLE_MANAGER.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
      ],
    });
    const draft = await commands.createDraft(requester.id, {
      title: "Manager's own expense",
      category: "Travel",
      amountMinor: 10000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    const submitted = await commands.submitClaim(requester.id, draft.id);

    expect(submitted.steps[0].assignedActorId).toBeUndefined();
  });

  describe("absence auto-skip", () => {
    it("auto-skips a vacant stage immediately on submission", async () => {
      const { commands } = buildCommands({
        employees: [employee, emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" })],
        flows: [
          { id: "flow-short", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });

      const submitted = await submitStandardDraft(commands);

      expect(submitted).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE_EXECUTIVE.id, currentActorId: "emp-finance" });
      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted", "skipped"]);
    });

    it("auto-skips a stage whose assigned actor has not responded within 3 days", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({ now: () => clock });
      const submitted = await submitStandardDraft(commands);

      clock = new Date("2026-08-07T09:59:00.000Z");
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({ currentStage: ROLE_MANAGER.id });

      clock = new Date("2026-08-07T10:00:01.000Z");
      const afterTimeout = await commands.getClaim(employee.id, submitted.id);

      expect(afterTimeout).toMatchObject({ currentStage: ROLE_FINANCE_HEAD.id, currentActorId: "emp-pramod" });
      expect(afterTimeout.history.map((event) => event.kind)).toEqual(["draft", "submitted", "skipped"]);
    });

    it("never auto-skips the terminal stage even when it is vacant", async () => {
      const { commands } = buildCommands({
        employees: [employee, emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" })],
        flows: [
          { id: "flow-short", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });
      const submitted = await submitStandardDraft(commands);

      const afterApproval = await commands.approveStage("emp-ada", submitted.id);

      expect(afterApproval).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE_EXECUTIVE.id, currentActorId: undefined });
      expect(afterApproval.steps.at(-1)).toMatchObject({ status: "pending" });
    });
  });

  describe("hierarchy override takeover", () => {
    it("lets a later-stage role skip earlier pending stages with a reason code", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      const takenOver = await commands.takeOverClaim("emp-finance", submitted.id, "Urgent payment deadline");

      expect(takenOver).toMatchObject({ status: "in-finance", currentStage: ROLE_FINANCE_EXECUTIVE.id, currentActorId: "emp-finance" });
      expect(takenOver.steps[0]).toMatchObject({ status: "skipped" });
      expect(takenOver.steps[1]).toMatchObject({ status: "skipped" });
      expect(takenOver.steps[2]).toMatchObject({ status: "pending" });
      const overrideEvent = takenOver.history.find((event) => event.kind === "takeover");
      expect(overrideEvent).toMatchObject({ actorId: "emp-finance" });
      expect(overrideEvent?.detail).toContain("Urgent payment deadline");
    });

    it("requires a non-empty reason code", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.takeOverClaim("emp-finance", submitted.id, "   ")).rejects.toMatchObject({ code: "validation" });
    });

    it("rejects a takeover from a role with no later step in the flow", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.takeOverClaim("emp-ada", submitted.id, "Not eligible")).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("prevents a requester from taking over their own claim", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.takeOverClaim(employee.id, submitted.id, "Any reason")).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("lets Finance Head take over a flow without a Finance Head step by routing it to the terminal Finance Executive stage", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          { id: "flow-no-head", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });
      const submitted = await submitStandardDraft(commands);

      const takenOver = await commands.takeOverClaim("emp-pramod", submitted.id, "Urgent resolution");

      expect(takenOver).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(takenOver.steps[0]).toMatchObject({ status: "skipped" });
      // The terminal stage is assigned to the eligible Finance Executive
      // and is never skipped by the takeover.
      expect(takenOver.steps[1]).toMatchObject({ status: "pending", assignedActorId: "emp-finance" });
      const overrideEvent = takenOver.history.find((event) => event.kind === "takeover");
      expect(overrideEvent).toMatchObject({ actorId: "emp-pramod" });
      expect(overrideEvent?.detail).toContain("Urgent resolution");
    });

    it("lands a Finance Head takeover on the terminal stage with no assigned actor when no Finance Executive holder exists", async () => {
      const { commands } = buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
        ],
        flows: [
          { id: "flow-no-head", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });
      const submitted = await submitStandardDraft(commands);

      const takenOver = await commands.takeOverClaim("emp-pramod", submitted.id, "Urgent resolution");

      expect(takenOver).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: undefined,
      });
      expect(takenOver.steps[0]).toMatchObject({ status: "skipped" });
      expect(takenOver.steps[1]).toMatchObject({ status: "pending", assignedActorId: undefined });
    });

    it("lets a Manager take over an intern flow, skipping the team-lead step with a team-lead label", async () => {
      const intern: ExpenseEmployee = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: "emp-abilash",
      });
      const { commands } = buildCommands({
        employees: [
          intern,
          emp("emp-abilash", "Abilash", ROLE_TEAM_LEAD, { departmentId: "dept-eng" }),
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          {
            id: "flow-intern",
            roleId: ROLE_INTERN.id,
            steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern cab ride",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(intern.id, draft.id);

      const takenOver = await commands.takeOverClaim("emp-ada", draft.id, "Deadline");

      // The takeover lands on the manager's own step, skipping only the
      // team-lead step ahead of it.
      expect(takenOver.steps[0]).toMatchObject({ status: "skipped", roleId: null });
      expect(takenOver).toMatchObject({ status: "in-approval", currentStage: ROLE_MANAGER.id, currentActorId: "emp-ada" });
      const overrideEvent = takenOver.history.find((event) => event.kind === "takeover");
      expect(overrideEvent?.detail).toContain("team lead");
    });

    it("cannot target a team-lead step: the named person's role never matches a role-less step", async () => {
      const intern: ExpenseEmployee = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: "emp-abilash",
      });
      const { commands } = buildCommands({
        employees: [
          intern,
          emp("emp-abilash", "Abilash", ROLE_TEAM_LEAD, { departmentId: "dept-eng" }),
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
        flows: [
          {
            id: "flow-intern",
            roleId: ROLE_INTERN.id,
            steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern cab ride",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      await commands.submitClaim(intern.id, draft.id);

      await expect(commands.takeOverClaim("emp-abilash", draft.id, "My review")).rejects.toMatchObject({
        code: "unauthorized",
      });
    });
  });

  describe("rejection", () => {
    it("lets an assigned approver reject a claim outright, terminating it immediately", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      const rejected = await commands.rejectClaim("emp-ada", submitted.id, "Missing itemized receipt");

      expect(rejected).toMatchObject({ status: "rejected", currentStage: undefined, currentActorId: undefined });
      expect(rejected.steps[0]).toMatchObject({ status: "rejected" });
      expect(rejected.history.at(-1)).toMatchObject({ kind: "rejected", actorId: "emp-ada", detail: "Missing itemized receipt" });
    });

    it("lets Finance reject a claim outright instead of sending it back for correction", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", submitted.id);
      await commands.approveStage("emp-pramod", submitted.id);

      const rejected = await commands.rejectClaim("emp-finance", submitted.id, "Payout details missing IFSC code");

      expect(rejected.status).toBe("rejected");
      expect(rejected.steps.at(-1)).toMatchObject({ status: "rejected" });
    });

    it("requires a non-empty reason", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.rejectClaim("emp-ada", submitted.id, "   ")).rejects.toMatchObject({ code: "validation" });
    });

    it("accepts a rejection reason longer than 200 characters", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      const longReason = `The expense form is missing both the itemized receipt and the GST invoice, and the vendor's name does not match the bank statement. ${"x".repeat(200)}`;

      const rejected = await commands.rejectClaim("emp-ada", submitted.id, longReason);

      expect(rejected.status).toBe("rejected");
      expect(rejected.history.at(-1)).toMatchObject({ kind: "rejected", detail: longReason });
    });

    it("rejects rejection from someone the claim is not assigned to", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.rejectClaim("emp-pramod", submitted.id, "Not my stage")).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("does not allow a rejected claim to be edited, approved, or resubmitted", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.rejectClaim("emp-ada", submitted.id, "Not eligible for reimbursement");

      // The claim has no current stage or actor anymore, so it is no longer
      // assigned to anyone and cannot be acted on again: rejection is
      // unauthorized for the old actor, and the new approval gate sees no
      // pending stage at all.
      await expect(commands.rejectClaim("emp-ada", submitted.id, "Again")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.approveStage("emp-ada", submitted.id)).rejects.toMatchObject({ code: "conflict" });
    });

    it("lets the employee submit a new, distinct claim for the same expense after a rejection, restarting at the first stage while the rejected claim's history stays unchanged", async () => {
      const { commands } = buildCommands();
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
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.rejectClaim("emp-ada", submitted.id, "Not eligible for reimbursement");

      await expect(commands.updateComments("emp-finance", submitted.id, "Follow-up note")).rejects.toMatchObject({
        code: "conflict",
      });
    });
  });

  describe("claim visibility for getClaim", () => {
    it("lets an approver view a claim's detail after it has moved past their stage", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", submitted.id);
      await commands.approveStage("emp-pramod", submitted.id);

      const managerClaims = await commands.listClaims("emp-ada");
      expect(managerClaims.find((claim) => claim.id === submitted.id)).toBeUndefined();

      await expect(commands.getClaim("emp-ada", submitted.id)).resolves.toMatchObject({ id: submitted.id });
    });

    it("lets Finance view any claim in the organization", async () => {
      const { commands } = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      await expect(commands.getClaim("emp-finance", draft.id)).resolves.toMatchObject({ id: draft.id });
    });

    it("denies an employee who never touched the claim and is not Finance", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.getClaim("emp-katherine", submitted.id)).rejects.toMatchObject({ code: "unauthorized" });
    });
  });

  describe("activity feed", () => {
    it("keeps a decision visible in the actor's activity feed after the claim moves past their stage", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", submitted.id);
      // Advance the claim well past the manager stage: emp-ada should no
      // longer see it in their workspace, but it must still show up in their
      // activity feed.
      await commands.approveStage("emp-pramod", submitted.id);

      const managerClaims = await commands.listClaims("emp-ada");
      expect(managerClaims.find((claim) => claim.id === submitted.id)).toBeUndefined();

      const activity = await commands.listActivity("emp-ada");
      expect(activity).toEqual([
        expect.objectContaining({ claimId: submitted.id, claimRef: submitted.ref, kind: "approved" }),
      ]);
    });

    it("includes rejections and comments, but not drafts, submissions, or skips", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.rejectClaim("emp-ada", submitted.id, "Missing itemized receipt");

      const employeeActivity = await commands.listActivity(employee.id);
      expect(employeeActivity).toEqual([]);

      const managerActivity = await commands.listActivity("emp-ada");
      expect(managerActivity).toEqual([
        expect.objectContaining({ claimId: submitted.id, kind: "rejected", detail: "Missing itemized receipt" }),
      ]);
    });

    it("lets Finance view another employee's activity, but not an ordinary employee", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.rejectClaim("emp-ada", submitted.id, "Missing itemized receipt");

      await expect(commands.listActivity("emp-finance", "emp-ada")).resolves.toEqual([
        expect.objectContaining({ claimId: submitted.id, kind: "rejected" }),
      ]);
      await expect(commands.listActivity(employee.id, "emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
    });
  });

  describe("organization-wide activity feed", () => {
    function buildWithFinanceHead() {
      return buildCommands({
        employees: [
          employee,
          emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
          emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
          emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
        ],
      });
    }

    it("lets Finance Head see decisions made by anyone in the organization", async () => {
      const { commands } = buildWithFinanceHead();
      const submitted = await submitStandardDraft(commands);
      await commands.rejectClaim("emp-ada", submitted.id, "Missing itemized receipt");

      const activity = await commands.listOrganizationActivity("emp-pramod");
      expect(activity).toEqual([
        expect.objectContaining({ claimId: submitted.id, kind: "rejected", actorId: "emp-ada", actorName: "Ada Lovelace" }),
      ]);
    });

    it("denies the organization activity feed to Finance Executive and ordinary employees", async () => {
      const { commands } = buildWithFinanceHead();

      await expect(commands.listOrganizationActivity("emp-finance")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.listOrganizationActivity(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("gives Finance Head the same standing oversight as Finance: payout details, comments, and any employee's activity", async () => {
      const { commands } = buildWithFinanceHead();
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

  describe("receipt downloads", () => {
    async function createReceiptDraft(commands: ReturnType<typeof buildCommands>["commands"]) {
      return commands.createDraft(employee.id, {
        title: "Bengaluru client flight",
        category: "Travel",
        amountMinor: 1250000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "flight-receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
    }

    it("gives the requester the stored receipt bytes", async () => {
      const { commands } = buildCommands();
      const draft = await createReceiptDraft(commands);

      const receipt = await commands.getReceipt(employee.id, draft.id);

      expect(receipt).toEqual({
        fileName: "flight-receipt.pdf",
        contentType: "application/pdf",
        contentSha256: createHash("sha256").update(PDF_RECEIPT).digest("hex"),
        sizeBytes: PDF_RECEIPT.byteLength,
        data: PDF_RECEIPT,
      });
    });

    it("gives a manager who acted on the claim the receipt, even after the claim moved past their stage", async () => {
      const { commands } = buildCommands();
      const draft = await createReceiptDraft(commands);
      await commands.submitClaim(employee.id, draft.id);
      await commands.approveStage("emp-ada", draft.id);

      await expect(commands.getReceipt("emp-ada", draft.id)).resolves.toMatchObject({
        fileName: "flight-receipt.pdf",
        sizeBytes: PDF_RECEIPT.byteLength,
      });
    });

    it("gives Finance standing access to any claim's receipt", async () => {
      const { commands } = buildCommands();
      const draft = await createReceiptDraft(commands);

      await expect(commands.getReceipt("emp-finance", draft.id)).resolves.toMatchObject({
        fileName: "flight-receipt.pdf",
      });
    });

    it("denies the receipt to an employee of another organization", async () => {
      const outsider: ExpenseEmployee = {
        id: "emp-outsider",
        organizationId: "org-2",
        name: "Outsider",
        role: ROLE_EXECUTIVE,
        active: true,
        managerId: null,
      };
      const { commands } = buildCommands({ employees: [...BASE_EMPLOYEES, outsider] });
      const draft = await createReceiptDraft(commands);

      await expect(commands.getReceipt(outsider.id, draft.id)).rejects.toMatchObject({
        code: "not-found",
      });
    });

    it("reports not-found for a claim without a receipt", async () => {
      const { commands } = buildCommands();
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });

      await expect(commands.getReceipt(employee.id, draft.id)).rejects.toMatchObject({
        code: "not-found",
        message: "This claim has no receipt.",
      });
    });

    it("reports not-found when the blob is missing from the store", async () => {
      const { commands, blobStore } = buildCommands();
      const draft = await createReceiptDraft(commands);
      await blobStore.deleteBlob(draft.attachment!.storageKey);

      await expect(commands.getReceipt(employee.id, draft.id)).rejects.toMatchObject({
        code: "not-found",
        message: "The receipt is unavailable.",
      });
    });

    it("refuses to serve bytes whose digest no longer matches the attachment record", async () => {
      const { commands, blobStore } = buildCommands();
      const draft = await createReceiptDraft(commands);
      await blobStore.putBlob(draft.attachment!.storageKey, bytes(0x00, 0x11, 0x22, 0x33), "application/pdf");

      await expect(commands.getReceipt(employee.id, draft.id)).rejects.toMatchObject({
        code: "not-found",
        message: "The receipt is unavailable.",
      });
    });
  });
});

describe("updateDraft", () => {

  const UPDATE_FIELDS = {
    title: "Renamed client dinner",
    category: "Meals",
    subCategory: "Client Meeting",
    remark: "Edited remark",
    amountMinor: 99900,
    currency: "INR",
    expenseDate: "2026-08-05",
    payoutDetails: { accountNumber: "99999999999", ifscCode: "HDFC0001234" },
  };

  async function buildDraftWithReceipt() {
    const built = buildCommands();
    const draft = await built.commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    return { ...built, draft };
  }

  it("updates the draft fields and bumps the version, keeping the stored receipt", async () => {
    const { commands, blobStore, draft } = await buildDraftWithReceipt();
    const key = draft.attachment!.storageKey;

    const updated = await commands.updateDraft(employee.id, draft.id, UPDATE_FIELDS);

    expect(updated).toMatchObject({
      id: draft.id,
      title: "Renamed client dinner",
      category: "Meals",
      subCategory: "Client Meeting",
      remark: "Edited remark",
      amountMinor: 99900,
      expenseDate: "2026-08-05",
      payoutDetails: { accountNumber: "99999999999", ifscCode: "HDFC0001234" },
      version: draft.version + 1,
    });
    expect(updated.attachment).toEqual(draft.attachment);
    await expect(blobStore.getBlob(key)).resolves.not.toBeNull();
  });

  it("adds a receipt to a draft that skipped it, storing the bytes under the claim key", async () => {
    const { commands, blobStore } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Taxi",
      category: "Travel",
      amountMinor: 45000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });
    expect(draft.attachment).toBeUndefined();

    const updated = await commands.updateDraft(employee.id, draft.id, {
      ...UPDATE_FIELDS,
      attachment: { fileName: "taxi.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });

    expect(updated.attachment).toMatchObject({
      fileName: "taxi.pdf",
      contentType: "application/pdf",
      storageKey: `org-1/${draft.id}/attachment-1.pdf`,
      sizeBytes: PDF_RECEIPT.byteLength,
    });
    await expect(blobStore.getBlob(updated.attachment!.storageKey)).resolves.toMatchObject({
      data: PDF_RECEIPT,
    });
  });

  it("rejects replacing an existing receipt", async () => {
    const { commands, draft } = await buildDraftWithReceipt();

    await expect(
      commands.updateDraft(employee.id, draft.id, {
        ...UPDATE_FIELDS,
        attachment: { fileName: "other.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "This draft already has a receipt. Delete the draft to start over with a different receipt.",
    });
  });

  it("replaces a legacy placeholder attachment row (empty digest) with a real receipt", async () => {
    const { commands, store, blobStore, draft } = await buildDraftWithReceipt();
    // Migration 0019 documented placeholder rows with no digest and no
    // stored object; rewriting the stored claim simulates that legacy state.
    const stored = (await store.getClaim(draft.id))!;
    await store.updateClaim({
      ...stored,
      attachment: { ...stored.attachment!, contentSha256: "" },
    });

    const updated = await commands.updateDraft(employee.id, draft.id, {
      ...UPDATE_FIELDS,
      attachment: { fileName: "real.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });

    expect(updated.attachment).toMatchObject({
      id: draft.attachment!.id,
      fileName: "real.pdf",
      contentType: "application/pdf",
      contentSha256: createHash("sha256").update(PDF_RECEIPT).digest("hex"),
    });
    await expect(blobStore.getBlob(updated.attachment!.storageKey)).resolves.toMatchObject({ data: PDF_RECEIPT });
  });

  it("rejects editing a claim that is not a draft", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.updateDraft(employee.id, submitted.id, UPDATE_FIELDS)).rejects.toMatchObject({
      code: "conflict",
      message: "Only a draft claim can be edited.",
    });
  });

  it("rejects editing someone else's claim", async () => {
    const { commands, draft } = await buildDraftWithReceipt();

    await expect(commands.updateDraft("emp-katherine", draft.id, UPDATE_FIELDS)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("compensates the new blob when the store write fails after the upload", async () => {
    const { commands, store, blobStore, draft } = await (async () => {
      const built = buildCommands();
      const draft = await built.commands.createDraft(employee.id, {
        title: "Taxi",
        category: "Travel",
        amountMinor: 45000,
        currency: "INR",
        expenseDate: "2026-08-04",
      });
      return { ...built, draft };
    })();
    vi.spyOn(store, "updateClaim").mockRejectedValue(new Error("database unavailable"));

    await expect(
      commands.updateDraft(employee.id, draft.id, {
        ...UPDATE_FIELDS,
        attachment: { fileName: "taxi.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      }),
    ).rejects.toThrow("database unavailable");
    await expect(blobStore.getBlob(`org-1/${draft.id}/attachment-1.pdf`)).resolves.toBeNull();
  });

  it("does not delete the kept receipt blob when a field-only update fails", async () => {
    const { commands, store, blobStore, draft } = await buildDraftWithReceipt();
    const key = draft.attachment!.storageKey;
    vi.spyOn(store, "updateClaim").mockRejectedValue(new Error("database unavailable"));

    await expect(commands.updateDraft(employee.id, draft.id, UPDATE_FIELDS)).rejects.toThrow(
      "database unavailable",
    );
    await expect(blobStore.getBlob(key)).resolves.not.toBeNull();
  });
});

describe("deleteDraft", () => {
  it("deletes the claim and its stored receipt bytes", async () => {
    const { commands, store, blobStore } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    const key = draft.attachment!.storageKey;

    await commands.deleteDraft(employee.id, draft.id);

    await expect(store.getClaim(draft.id)).resolves.toBeNull();
    await expect(blobStore.getBlob(key)).resolves.toBeNull();
  });

  it("deletes a receipt-less draft", async () => {
    const { commands, store } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Taxi",
      category: "Travel",
      amountMinor: 45000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await commands.deleteDraft(employee.id, draft.id);

    await expect(store.getClaim(draft.id)).resolves.toBeNull();
  });

  it("rejects deleting a claim that is not a draft", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.deleteDraft(employee.id, submitted.id)).rejects.toMatchObject({
      code: "conflict",
      message: "Only a draft claim can be deleted.",
    });
  });

  it("rejects deleting someone else's claim", async () => {
    const { commands } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.deleteDraft("emp-katherine", draft.id)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("succeeds even when the blob delete fails, leaving an unreachable orphan", async () => {
    const { commands, store, blobStore, draft } = await (async () => {
      const built = buildCommands();
      const draft = await built.commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      return { ...built, draft };
    })();
    vi.spyOn(blobStore, "deleteBlob").mockRejectedValue(new Error("blob unavailable"));

    await expect(commands.deleteDraft(employee.id, draft.id)).resolves.toBeUndefined();
    await expect(store.getClaim(draft.id)).resolves.toBeNull();
  });

  it("guards the delete with the claim version it read", async () => {
    const { commands, store } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });
    const deleteSpy = vi.spyOn(store, "deleteClaim");

    await commands.deleteDraft(employee.id, draft.id);

    expect(deleteSpy).toHaveBeenCalledWith(draft.id, draft.version);
  });

  it("rejects a store conflict, leaving the claim and its receipt in place", async () => {
    const { commands, store, blobStore } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    const key = draft.attachment!.storageKey;
    vi.spyOn(store, "deleteClaim").mockRejectedValue(
      Object.assign(new Error("Claim was changed by another request."), { code: "conflict" }),
    );

    await expect(commands.deleteDraft(employee.id, draft.id)).rejects.toMatchObject({ code: "conflict" });
    await expect(store.getClaim(draft.id)).resolves.toMatchObject({ id: draft.id, status: "draft" });
    await expect(blobStore.getBlob(key)).resolves.not.toBeNull();
  });

  it("cannot delete a draft that was concurrently submitted", async () => {
    const { commands, store, blobStore } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    const submitted = await commands.submitClaim(employee.id, draft.id);

    await expect(store.deleteClaim(draft.id, draft.version)).rejects.toMatchObject({
      code: "conflict",
      message: "Claim was changed by another request.",
    });
    await expect(store.getClaim(draft.id)).resolves.toMatchObject({ id: draft.id, status: submitted.status });
    await expect(blobStore.getBlob(draft.attachment!.storageKey)).resolves.not.toBeNull();
  });
});
