import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "../blob/fakes";
import type { BlobStore } from "../blob/ports";
import type { AmountGuard } from "../admin/ports";
import { createExpenseCommands } from "./commands";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseEmployee, ExpenseFlow, FlowStepTarget } from "./ports";
import { MAX_RECEIPT_SIZE_BYTES } from "./receipt-validation";

// The default privilege catalog (ADR-0015) the migration and seeds backfill:
// submit-only except Manager +approve, Finance Head +finance +org activity,
// Finance Executive +finance. The fixtures carry it so the sweep's
// privilege check behaves like production data.
const SUBMIT_ONLY = {
  canSubmit: true,
  canApprove: false,
  canAccessFinance: false,
  canHold: false,
  canViewOrganizationActivity: false,
  canAccessAdminConsole: false,
};

const ROLE_EXECUTIVE = { id: "role-executive", code: "executive", displayName: "Executive", capabilities: { ...SUBMIT_ONLY } };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager", capabilities: { ...SUBMIT_ONLY, canApprove: true } };
const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true, canViewOrganizationActivity: true } };
const ROLE_FINANCE_EXECUTIVE = { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive", capabilities: { ...SUBMIT_ONLY, canAccessFinance: true } };
const ROLE_TEAM_LEAD = { id: "role-team-lead", code: "team-lead", displayName: "Team Lead", capabilities: { ...SUBMIT_ONLY } };
const ROLE_INTERN = { id: "role-intern", code: "intern", displayName: "Intern", capabilities: { ...SUBMIT_ONLY } };
const ROLE_SUPERADMIN = { id: "role-superadmin", code: "superadmin", displayName: "Superadmin" };

const roleStep = (roleId: string): FlowStepTarget => ({ kind: "role", roleId });
const TEAM_LEAD_STEP: FlowStepTarget = { kind: "team-lead" };

const guardedStep = (roleId: string, operator: AmountGuard["operator"], amountMinor: number): FlowStepTarget => ({
  kind: "role",
  roleId,
  guard: { operator, amountMinor },
});

const guardedTeamLeadStep = (operator: AmountGuard["operator"], amountMinor: number): FlowStepTarget => ({
  kind: "team-lead",
  guard: { operator, amountMinor },
});

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

// A test store whose published flow can be swapped mid-test, so a later
// flow edit is observable against claims already submitted under the old
// flow definition (the real stores snapshot the flow at submission).
class FlowEditingStore extends InMemoryExpenseStore {
  private publishedFlow: ExpenseFlow | null;

  constructor(flow: ExpenseFlow | null, employees: ExpenseEmployee[]) {
    super({ employees, flows: flow ? [flow] : [] });
    this.publishedFlow = flow;
  }

  async getPublishedFlowForRole(): Promise<ExpenseFlow | null> {
    return this.publishedFlow;
  }

  setPublishedFlow(flow: ExpenseFlow): void {
    this.publishedFlow = flow;
  }
}

function buildCommands(overrides: { employees?: ExpenseEmployee[]; flows?: ExpenseFlow[]; now?: () => Date; blobStore?: BlobStore; store?: InMemoryExpenseStore; absenceTimeout?: { getAbsenceTimeoutDays: (organizationId: string) => Promise<number> } } = {}) {
  const store = overrides.store ?? new InMemoryExpenseStore({
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
      ...(overrides.absenceTimeout ? { absenceTimeout: overrides.absenceTimeout } : {}),
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
    attachment: {
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      data: PDF_RECEIPT,
    },
  });
  return commands.submitClaim(actorId, draft.id);
}

async function submitDraftWithAmount(
  commands: ReturnType<typeof buildCommands>["commands"],
  amountMinor: number,
  actorId = employee.id,
) {
  const draft = await commands.createDraft(actorId, {
    title: "Client dinner",
    category: "Meals",
    amountMinor,
    currency: "INR",
    expenseDate: "2026-08-04",
    attachment: {
      fileName: "receipt.pdf",
      contentType: "application/pdf",
      data: PDF_RECEIPT,
    },
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
      message: "The receipt is larger than 25 MB.",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
  });

  it("rejects JPEG receipt bytes, which are no longer an accepted receipt format", async () => {
    const { commands, blobStore } = buildCommands();

    await expect(
      commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "photo.jpg", contentType: "image/jpeg", data: JPEG_RECEIPT },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "Receipts must be a PDF file.",
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
      message: "Receipts must be a PDF file.",
    });
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
      await expect(commands.delegateClaim(inactive.id, "claim-1", "emp-ada", "Urgent")).rejects.toMatchObject({ code: "unauthorized" });
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

  it("rejects submission when the requester's role lacks the submit privilege", async () => {
    const noSubmitRole = { id: "role-no-submit", code: "guest", displayName: "Guest", capabilities: { ...SUBMIT_ONLY, canSubmit: false } };
    const guest: ExpenseEmployee = emp("emp-guest", "Guest User", noSubmitRole);
    const { commands } = buildCommands({
      employees: [guest, emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" })],
      flows: [STANDARD_FLOW],
    });
    const draft = await commands.createDraft(guest.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.submitClaim(guest.id, draft.id)).rejects.toMatchObject({
      code: "unauthorized",
      message: "Your role does not have the submit privilege.",
    });
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

  it("rejects submitting a draft without a receipt, keeping the draft submittable once a receipt is attached", async () => {
    const { commands } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.submitClaim(employee.id, draft.id)).rejects.toMatchObject({
      code: "validation",
      message: "A receipt is required before this claim can be submitted.",
    });

    const withReceipt = await commands.updateDraft(employee.id, draft.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    await expect(commands.submitClaim(employee.id, withReceipt.id)).resolves.toMatchObject({
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
    });
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

  describe("finance verification pool authorization", () => {
    it("allows any active Finance Executive to verify and mark paid a claim submitted by Finance Head", async () => {
      const financeHead = emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" });
      const financeExec1 = emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });
      const financeExec2 = emp("emp-rishikesh", "Rishikesh 2", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });

      const financeHeadFlow: ExpenseFlow = {
        id: "flow-finance-head",
        roleId: ROLE_FINANCE_HEAD.id,
        steps: [roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      };

      const { commands } = buildCommands({
        employees: [financeHead, financeExec1, financeExec2],
        flows: [financeHeadFlow],
      });

      const draft = await commands.createDraft(financeHead.id, {
        title: "Finance Head Conference Fee",
        category: "Training",
        amountMinor: 500000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });

      const submitted = await commands.submitClaim(financeHead.id, draft.id);
      expect(submitted.status).toBe("in-finance");

      // First executive verifies the claim
      const verified = await commands.verifyClaim(financeExec1.id, submitted.id);
      expect(verified.steps[0].status).toBe("verified");

      // Second executive marks the claim paid
      const paid = await commands.markPaid(financeExec2.id, submitted.id);
      expect(paid.status).toBe("paid");
    });

    it("allows any eligible pool member to verify and mark paid even if currentActorId was assigned to another pool member", async () => {
      const execUser = emp("emp-shameel", "Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng" });
      const managerUser = emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" });
      const financeHead = emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" });
      const financeExec1 = emp("emp-finance", "Rishikesh 1", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });
      const financeExec2 = emp("emp-rishikesh", "Rishikesh 2", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });

      const { commands } = buildCommands({
        employees: [execUser, managerUser, financeHead, financeExec1, financeExec2],
        flows: [STANDARD_FLOW],
      });

      const draft = await commands.createDraft(execUser.id, {
        title: "Software license",
        category: "Software",
        amountMinor: 150000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });

      const submitted = await commands.submitClaim(execUser.id, draft.id);
      await commands.approveStage(managerUser.id, submitted.id);
      await commands.approveStage(financeHead.id, submitted.id);

      const inFinanceClaim = await commands.getClaim(execUser.id, submitted.id);
      expect(inFinanceClaim.status).toBe("in-finance");
      // Current actor defaults to financeExec1
      expect(inFinanceClaim.currentActorId).toBe(financeExec1.id);

      // financeExec2 (not currentActorId) verifies the claim
      const verified = await commands.verifyClaim(financeExec2.id, submitted.id);
      expect(verified.steps[2].status).toBe("verified");

      // financeExec2 marks paid
      const paid = await commands.markPaid(financeExec2.id, submitted.id);
      expect(paid.status).toBe("paid");
    });

    it("prevents the requester (Finance Head or Finance Executive) from verifying or paying their own claim", async () => {
      const financeHead = emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" });
      const financeExec = emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });
      const financeExec2 = emp("emp-rishikesh", "Rishikesh 2", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });

      const financeHeadFlow: ExpenseFlow = {
        id: "flow-finance-head",
        roleId: ROLE_FINANCE_HEAD.id,
        steps: [roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      };

      const financeExecFlow: ExpenseFlow = {
        id: "flow-finance-exec",
        roleId: ROLE_FINANCE_EXECUTIVE.id,
        steps: [roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      };

      const { commands } = buildCommands({
        employees: [financeHead, financeExec, financeExec2],
        flows: [financeHeadFlow, financeExecFlow],
      });

      // Scenario 1: Finance Head submits own claim
      const draftHead = await commands.createDraft(financeHead.id, {
        title: "Finance Head taxi",
        category: "Travel",
        amountMinor: 20000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const headClaim = await commands.submitClaim(financeHead.id, draftHead.id);

      // Finance Head attempts to verify own claim -> rejected
      await expect(commands.verifyClaim(financeHead.id, headClaim.id)).rejects.toMatchObject({
        code: "unauthorized",
      });

      // Finance Executive verifies it
      await commands.verifyClaim(financeExec.id, headClaim.id);

      // Finance Head attempts to mark own claim paid -> rejected
      await expect(commands.markPaid(financeHead.id, headClaim.id)).rejects.toMatchObject({
        code: "unauthorized",
      });

      // Finance Executive pays it -> succeeds
      await expect(commands.markPaid(financeExec.id, headClaim.id)).resolves.toMatchObject({
        status: "paid",
      });

      // Scenario 2: Finance Executive submits own claim
      const draftExec = await commands.createDraft(financeExec.id, {
        title: "Finance Exec office supplies",
        category: "Supplies",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const execClaim = await commands.submitClaim(financeExec.id, draftExec.id);
      await commands.approveStage(financeHead.id, execClaim.id);

      // Finance Exec attempts to verify own claim -> rejected
      await expect(commands.verifyClaim(financeExec.id, execClaim.id)).rejects.toMatchObject({
        code: "unauthorized",
      });

      // Second Finance Exec verifies it
      await commands.verifyClaim(financeExec2.id, execClaim.id);

      // Finance Exec attempts to pay own claim -> rejected
      await expect(commands.markPaid(financeExec.id, execClaim.id)).rejects.toMatchObject({
        code: "unauthorized",
      });

      // Second Finance Exec pays it -> succeeds
      await expect(commands.markPaid(financeExec2.id, execClaim.id)).resolves.toMatchObject({
        status: "paid",
      });
    });

    it("surfaces an in-finance claim to every holder of the terminal role, not just the assigned actor", async () => {
      const execUser = emp("emp-shameel", "Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng" });
      const managerUser = emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" });
      const financeHead = emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" });
      const financeExec1 = emp("emp-finance", "Rishikesh 1", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });
      const financeExec2 = emp("emp-rishikesh", "Rishikesh 2", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });

      const { commands } = buildCommands({
        employees: [execUser, managerUser, financeHead, financeExec1, financeExec2],
        flows: [STANDARD_FLOW],
      });

      const draft = await commands.createDraft(execUser.id, {
        title: "Software license",
        category: "Software",
        amountMinor: 150000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const submitted = await commands.submitClaim(execUser.id, draft.id);
      await commands.approveStage(managerUser.id, submitted.id);
      await commands.approveStage(financeHead.id, submitted.id);

      // financeExec2 is not the assigned actor (financeExec1 is) but holds
      // the terminal role: the claim must surface in their workspace so the
      // UI can offer verify/pay, matching the pool authorization.
      const poolMemberClaims = await commands.listClaims(financeExec2.id);
      expect(poolMemberClaims.find((claim) => claim.id === submitted.id)).toBeDefined();

      // A manager who does not hold the terminal role never sees it.
      const managerClaims = await commands.listClaims(managerUser.id);
      expect(managerClaims.find((claim) => claim.id === submitted.id)).toBeUndefined();

      // And once paid, the claim drops out of the pool surface again.
      await commands.verifyClaim(financeExec2.id, submitted.id);
      await commands.markPaid(financeExec2.id, submitted.id);
      const afterPaid = await commands.listClaims(financeExec2.id);
      expect(afterPaid.find((claim) => claim.id === submitted.id)).toBeUndefined();
    });
  });

  it("lists claims at or past the finance stage for Finance, and rejects everyone else", async () => {
    const { commands } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);
    await commands.approveStage("emp-pramod", draft.id);

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)).toBeDefined();

    await expect(commands.listFinancePaymentQueue(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-katherine")).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("includes rejected claims in the finance payment queue, and still denies inactive and non-Finance employees", async () => {
    const { commands } = buildCommands();
    const draft = await commands.createDraft(employee.id, {
      title: "Bengaluru client flight",
      category: "Travel",
      amountMinor: 1250000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    await commands.submitClaim(employee.id, draft.id);
    await commands.approveStage("emp-ada", draft.id);
    await commands.approveStage("emp-pramod", draft.id);
    await commands.rejectClaim("emp-finance", draft.id, "Payout details missing IFSC code");

    const financeQueue = await commands.listFinancePaymentQueue("emp-finance");
    expect(financeQueue.find((claim) => claim.id === draft.id)).toMatchObject({ status: "rejected" });

    const inactive = emp("emp-gone", "Gone Person", ROLE_EXECUTIVE, { active: false });
    const withInactive = buildCommands({ employees: [inactive, ...BASE_EMPLOYEES.slice(1)] });
    await expect(withInactive.commands.listFinancePaymentQueue(inactive.id)).rejects.toMatchObject({ code: "unauthorized" });

    await expect(commands.listFinancePaymentQueue(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(commands.listFinancePaymentQueue("emp-ada")).rejects.toMatchObject({ code: "unauthorized" });
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
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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

    it("advances past a guarded step immediately after skipping a vacant earlier step, not landing the claim on the skipped guard step", async () => {
      const { commands } = buildCommands({
        employees: [employee, emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" })],
        flows: [
          {
            id: "flow-vacant-then-guarded",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              roleStep(ROLE_MANAGER.id),
              guardedStep(ROLE_FINANCE_HEAD.id, "gte", 500000),
              roleStep(ROLE_FINANCE_EXECUTIVE.id),
            ],
          },
        ],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      // Manager is vacant (absence auto-skip); Finance Head is guarded off
      // (amount-guard auto-skip, ₹300 total is under the ₹5000 guard) - the
      // claim must land on the one step that is actually pending, Finance
      // Executive, not get stranded on the guard-skipped Finance Head step.
      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[1]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[2]).toMatchObject({ status: "pending" });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
    });
  });

  describe("privilege-loss auto-skip", () => {
    // A Manager whose approve toggle was removed (ADR-0015): the record
    // carries no action privilege, so the pending step is treated as
    // absent and swept forward on the next read.
    const PRIVILEGE_LESS_MANAGER = {
      ...ROLE_MANAGER,
      capabilities: { ...SUBMIT_ONLY, canApprove: false },
    };

    it("sweeps a pending step whose assigned actor's role lost its action privilege, with a named detail", async () => {
      const { commands, store } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      expect(submitted.currentStage).toBe(ROLE_MANAGER.id);

      store.setEmployeeRole("emp-ada", PRIVILEGE_LESS_MANAGER);

      const afterRemoval = await commands.getClaim(employee.id, submitted.id);

      expect(afterRemoval).toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
      expect(afterRemoval.steps[0]).toMatchObject({ status: "skipped" });
      const skipped = afterRemoval.history.find((event) => event.kind === "skipped");
      expect(skipped?.detail).toBe(
        "Skipped: the assigned role lacks the privilege to act on this stage",
      );
      // The skip is persisted like any other absence skip.
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
      });
    });

    it("does not sweep a role that still holds finance access without approve", async () => {
      const { commands, store } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      // Finance Head approves its stage with can_access_finance alone in
      // the default catalog: removing canApprove must not strand or sweep
      // the Finance Head stage.
      store.setEmployeeRole("emp-pramod", {
        ...ROLE_FINANCE_HEAD,
        capabilities: { ...SUBMIT_ONLY, canAccessFinance: true },
      });
      await commands.approveStage("emp-ada", submitted.id);

      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
    });

    it("sweeps only the stage whose role lost its privilege, leaving later stages pending", async () => {
      const { commands, store } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      store.setEmployeeRole("emp-ada", PRIVILEGE_LESS_MANAGER);

      const afterRemoval = await commands.getClaim(employee.id, submitted.id);

      expect(afterRemoval.history.filter((event) => event.kind === "skipped")).toHaveLength(1);
      expect(afterRemoval.steps).toMatchObject([
        { status: "skipped" },
        { status: "pending", assignedActorId: "emp-pramod" },
        { status: "pending" },
      ]);
    });

    it("sweeps a role step but never a team-lead step, whose person's own role is irrelevant", async () => {
      const internFlow = {
        id: "flow-intern",
        roleId: ROLE_INTERN.id,
        steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      };
      const intern = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
        departmentId: "dept-eng",
        managerId: "emp-abilash",
      });
      const { commands, store } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES,
          intern,
          emp("emp-abilash", "Abilash", ROLE_TEAM_LEAD, { departmentId: "dept-eng" }),
        ],
        flows: [internFlow],
      });
      const draft = await commands.createDraft(intern.id, {
        title: "Intern travel",
        category: "Travel",
        amountMinor: 5000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const submitted = await commands.submitClaim(intern.id, draft.id);
      expect(submitted.currentStage).toBeUndefined();
      expect(submitted.currentActorId).toBe("emp-abilash");

      // The team lead's own role is submit-only with no action privilege:
      // the person-targeted step must still wait for the named person.
      store.setEmployeeRole("emp-abilash", ROLE_TEAM_LEAD);

      await expect(commands.getClaim(intern.id, submitted.id)).resolves.toMatchObject({
        currentStage: undefined,
        currentActorId: "emp-abilash",
      });
      expect(submitted.history.filter((event) => event.kind === "skipped")).toHaveLength(0);
    });

    it("the sweep enforces the privilege skip even without a read", async () => {
      const { commands, store } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      store.setEmployeeRole("emp-ada", PRIVILEGE_LESS_MANAGER);

      const advanced = await commands.sweepAbsentClaims("org-1");

      expect(advanced.map((claim) => claim.id)).toEqual([submitted.id]);
      expect(advanced[0]).toMatchObject({ currentStage: ROLE_FINANCE_HEAD.id });
      expect(advanced[0].steps[0]).toMatchObject({ status: "skipped" });
    });
  });

  describe("absence auto-skip timeout resolution", () => {
    it("records the configured timeout in the skip detail (default 3 days)", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({ now: () => clock });
      const submitted = await submitStandardDraft(commands);

      clock = new Date("2026-08-07T10:00:01.000Z");
      const afterTimeout = await commands.getClaim(employee.id, submitted.id);

      const skipped = afterTimeout.history.find((event) => event.kind === "skipped");
      expect(skipped?.detail).toBe("Skipped: no response within 3 days");
    });

    it("waits for the organization's configured timeout instead of the default", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({
        now: () => clock,
        absenceTimeout: { getAbsenceTimeoutDays: async () => 7 },
      });
      const submitted = await submitStandardDraft(commands);

      // 5 days in: still inside the configured 7-day window.
      clock = new Date("2026-08-09T10:00:00.000Z");
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_MANAGER.id,
      });

      // Just past 7 days: the claim advances, and the skip detail names the
      // configured value so the audit trail is truthful about what applied.
      clock = new Date("2026-08-11T10:00:01.000Z");
      const afterTimeout = await commands.getClaim(employee.id, submitted.id);

      expect(afterTimeout).toMatchObject({ currentStage: ROLE_FINANCE_HEAD.id, currentActorId: "emp-pramod" });
      const skipped = afterTimeout.history.find((event) => event.kind === "skipped");
      expect(skipped?.detail).toBe("Skipped: no response within 7 days");
    });

    it("resolves each organization's timeout independently", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const orgTwoRequester = emp("emp-org2", "Org Two", ROLE_EXECUTIVE, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoManager = emp("emp-org2-manager", "Org Two Manager", ROLE_MANAGER, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoFinanceHead = emp("emp-org2-head", "Org Two Head", ROLE_FINANCE_HEAD, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoFinance = emp("emp-org2-finance", "Org Two Finance", ROLE_FINANCE_EXECUTIVE, { organizationId: "org-2", departmentId: "dept-org2" });
      const { commands } = buildCommands({
        now: () => clock,
        employees: [...BASE_EMPLOYEES, orgTwoRequester, orgTwoManager, orgTwoFinanceHead, orgTwoFinance],
        absenceTimeout: { getAbsenceTimeoutDays: async (organizationId) => (organizationId === "org-2" ? 10 : 3) },
      });
      const orgOneSubmitted = await submitStandardDraft(commands);
      const orgTwoDraft = await commands.createDraft(orgTwoRequester.id, {
        title: "Org two expense",
        category: "Meals",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const orgTwoSubmitted = await commands.submitClaim(orgTwoRequester.id, orgTwoDraft.id);

      // 4 days later: org-1's 3-day window has passed, org-2's 10-day
      // window has not, so the sweep advances exactly the org-1 claim.
      clock = new Date("2026-08-08T10:00:00.000Z");
      const advancedOrgOne = await commands.sweepAbsentClaims("org-1");
      expect(advancedOrgOne.map((claim) => claim.id)).toEqual([orgOneSubmitted.id]);
      expect(advancedOrgOne[0]).toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
      const advancedOrgTwo = await commands.sweepAbsentClaims("org-2");
      expect(advancedOrgTwo).toEqual([]);
      await expect(commands.getClaim(orgTwoRequester.id, orgTwoSubmitted.id)).resolves.toMatchObject({
        currentStage: ROLE_MANAGER.id,
      });
    });
  });

  describe("absence sweep", () => {
    it("advances claims past the configured timeout and returns the advanced claims", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({ now: () => clock });
      const submitted = await submitStandardDraft(commands);

      clock = new Date("2026-08-08T10:00:00.000Z");
      const advanced = await commands.sweepAbsentClaims("org-1");

      expect(advanced).toHaveLength(1);
      expect(advanced[0]).toMatchObject({ currentStage: ROLE_FINANCE_HEAD.id, currentActorId: "emp-pramod" });
      const skipped = advanced[0].history.find((event) => event.kind === "skipped");
      expect(skipped?.detail).toBe("Skipped: no response within 3 days");
      // The skip is persisted: the store now holds the advanced claim.
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
      });
    });

    it("leaves claims inside the timeout untouched", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({ now: () => clock });
      const submitted = await submitStandardDraft(commands);

      clock = new Date("2026-08-05T10:00:00.000Z");
      const advanced = await commands.sweepAbsentClaims("org-1");

      expect(advanced).toEqual([]);
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_MANAGER.id,
      });
    });

    it("processes each claim once across repeated passes", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({ now: () => clock });
      const submitted = await submitStandardDraft(commands);

      clock = new Date("2026-08-08T10:00:00.000Z");
      const first = await commands.sweepAbsentClaims("org-1");
      expect(first).toHaveLength(1);

      // The claim now sits at the Finance Head stage since the first pass;
      // a second pass sees the stage inside the timeout again (or a vacant
      // stage to advance past) but never re-processes the earlier step.
      const second = await commands.sweepAbsentClaims("org-1");
      expect(second).toEqual([]);
      const claim = await commands.getClaim(employee.id, submitted.id);
      expect(claim.history.filter((event) => event.kind === "skipped")).toHaveLength(1);
    });

    it("never auto-skips the terminal stage, even when it is vacant", async () => {
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({
        now: () => clock,
        employees: [employee, emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" })],
        flows: [
          { id: "flow-short", roleId: ROLE_EXECUTIVE.id, steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)] },
        ],
      });
      const submitted = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", submitted.id);

      clock = new Date("2026-09-01T10:00:00.000Z");
      const advanced = await commands.sweepAbsentClaims("org-1");

      expect(advanced).toEqual([]);
      await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
        status: "in-finance",
        currentActorId: undefined,
      });
    });

    it("is scoped to the swept organization", async () => {
      const orgTwoRequester = emp("emp-org2", "Org Two", ROLE_EXECUTIVE, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoManager = emp("emp-org2-manager", "Org Two Manager", ROLE_MANAGER, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoFinanceHead = emp("emp-org2-head", "Org Two Head", ROLE_FINANCE_HEAD, { organizationId: "org-2", departmentId: "dept-org2" });
      const orgTwoFinance = emp("emp-org2-finance", "Org Two Finance", ROLE_FINANCE_EXECUTIVE, { organizationId: "org-2", departmentId: "dept-org2" });
      let clock = new Date("2026-08-04T10:00:00.000Z");
      const { commands } = buildCommands({
        now: () => clock,
        employees: [...BASE_EMPLOYEES, orgTwoRequester, orgTwoManager, orgTwoFinanceHead, orgTwoFinance],
        // org-2's 10-day window keeps the assertion reads from advancing it
        // via the lazy read-path backstop while org-1's 3-day window passes.
        absenceTimeout: { getAbsenceTimeoutDays: async (organizationId) => (organizationId === "org-2" ? 10 : 3) },
      });
      const orgOneSubmitted = await submitStandardDraft(commands);
      const orgTwoDraft = await commands.createDraft(orgTwoRequester.id, {
        title: "Org two expense",
        category: "Meals",
        amountMinor: 10000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const orgTwoSubmitted = await commands.submitClaim(orgTwoRequester.id, orgTwoDraft.id);

      clock = new Date("2026-08-08T10:00:00.000Z");
      const advanced = await commands.sweepAbsentClaims("org-1");

      expect(advanced.map((claim) => claim.id)).toEqual([orgOneSubmitted.id]);
      // The org-2 claim is inside its own window, so neither the org-1
      // sweep nor the read below advances it.
      await expect(commands.getClaim(orgTwoRequester.id, orgTwoSubmitted.id)).resolves.toMatchObject({
        currentStage: ROLE_MANAGER.id,
        currentActorId: orgTwoManager.id,
      });
    });
  });

  describe("amount-guard auto-skip", () => {
    const guardedFlow = (guards: { operator: AmountGuard["operator"]; amountMinor: number }[]) => ({
      id: "flow-guarded",
      roleId: ROLE_EXECUTIVE.id,
      steps: [
        guardedStep(ROLE_MANAGER.id, guards[0]?.operator ?? "gte", guards[0]?.amountMinor ?? 500000),
        roleStep(ROLE_FINANCE_HEAD.id),
        roleStep(ROLE_FINANCE_EXECUTIVE.id),
      ],
    });

    it("auto-skips a guarded first step when the claim total is under the guard, advancing to the next step", async () => {
      const { commands } = buildCommands({
        flows: [guardedFlow([{ operator: "gte", amountMinor: 500000 }])],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped", decidedAt: "2026-08-04T10:00:00.000Z" });
      expect(submitted.steps[1]).toMatchObject({ status: "pending", assignedActorId: "emp-pramod" });
      expect(submitted.steps[2]).toMatchObject({ status: "pending" });
      expect(submitted).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted", "auto-skipped"]);
      const autoSkip = submitted.history.find((event) => event.kind === "auto-skipped");
      expect(autoSkip?.actorId).toBeUndefined();
      expect(autoSkip?.actorName).toBe("Policy");
      expect(autoSkip).toMatchObject({
        actorName: "Policy",
        detail: "Total ₹300 under ₹5000 guard on Manager step",
        createdAt: "2026-08-04T10:00:00.000Z",
      });
    });

    it("attaches actorName 'Policy' and no actorId to an auto-skipped history event on submission", async () => {
      const { commands } = buildCommands({
        flows: [guardedFlow([{ operator: "gte", amountMinor: 500000 }])],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);
      const autoSkip = submitted.history.find((event) => event.kind === "auto-skipped");

      expect(autoSkip).toBeDefined();
      expect(autoSkip?.actorId).toBeUndefined();
      expect(autoSkip?.actorName).toBe("Policy");
    });

    it("auto-skips a guarded mid-flow step while an earlier pending step stays current, and passes over the skip on approval", async () => {
      const { commands } = buildCommands({
        flows: [
          {
            id: "flow-fh-guarded",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              roleStep(ROLE_MANAGER.id),
              guardedStep(ROLE_FINANCE_HEAD.id, "gte", 500000),
              roleStep(ROLE_FINANCE_EXECUTIVE.id),
            ],
          },
        ],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      expect(submitted.steps[0]).toMatchObject({ status: "pending" });
      expect(submitted.steps[1]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[2]).toMatchObject({ status: "pending" });
      expect(submitted).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada",
      });
      expect(submitted.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹300 under ₹5000 guard on Finance Head step",
      );

      const afterManager = await commands.approveStage("emp-ada", submitted.id);
      expect(afterManager).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(afterManager.steps[1]).toMatchObject({ status: "skipped" });
      expect(afterManager.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(1);
    });

    it("routes a claim over the guard threshold through the guarded step normally, with no auto-skip event", async () => {
      const { commands } = buildCommands({
        flows: [guardedFlow([{ operator: "gte", amountMinor: 500000 }])],
      });

      const submitted = await submitDraftWithAmount(commands, 600000);

      expect(submitted.steps.map((step) => step.status)).toEqual(["pending", "pending", "pending"]);
      expect(submitted.steps[0]).toMatchObject({ status: "pending", assignedActorId: "emp-ada" });
      expect(submitted).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada",
      });
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted"]);
    });

    it("runs a gte-guarded step at the exact boundary, but auto-skips a gt-guarded one", async () => {
      const gteCommands = buildCommands({
        flows: [guardedFlow([{ operator: "gte", amountMinor: 500000 }])],
      }).commands;
      const atBoundary = await submitDraftWithAmount(gteCommands, 500000);
      expect(atBoundary.steps[0]).toMatchObject({ status: "pending" });
      expect(atBoundary.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(0);

      const gtCommands = buildCommands({
        flows: [guardedFlow([{ operator: "gt", amountMinor: 500000 }])],
      }).commands;
      const stillUnder = await submitDraftWithAmount(gtCommands, 500000);
      expect(stillUnder.steps[0]).toMatchObject({ status: "skipped" });
      expect(stillUnder.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹5000 at or under ₹5000 guard on Manager step",
      );
    });

    it("runs an lte-guarded step at the exact boundary, but auto-skips an lt-guarded one and an over-threshold lte one", async () => {
      const lteCommands = buildCommands({
        flows: [guardedFlow([{ operator: "lte", amountMinor: 500000 }])],
      }).commands;
      const atBoundary = await submitDraftWithAmount(lteCommands, 500000);
      expect(atBoundary.steps[0]).toMatchObject({ status: "pending" });
      expect(atBoundary.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(0);

      const ltCommands = buildCommands({
        flows: [guardedFlow([{ operator: "lt", amountMinor: 500000 }])],
      }).commands;
      const stillAt = await submitDraftWithAmount(ltCommands, 500000);
      expect(stillAt.steps[0]).toMatchObject({ status: "skipped" });
      expect(stillAt.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹5000 at or above ₹5000 guard on Manager step",
      );

      const lteOverCommands = buildCommands({
        flows: [guardedFlow([{ operator: "lte", amountMinor: 500000 }])],
      }).commands;
      const overThreshold = await submitDraftWithAmount(lteOverCommands, 600000);
      expect(overThreshold.steps[0]).toMatchObject({ status: "skipped" });
      expect(overThreshold.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹6000 above ₹5000 guard on Manager step",
      );
    });

    it("freezes the guard outcome in the claim snapshot: a later flow edit does not change the submitted claim's steps", async () => {
      const flow = guardedFlow([{ operator: "gte", amountMinor: 500000 }]);
      const store = new FlowEditingStore(flow, BASE_EMPLOYEES);
      const { commands } = buildCommands({ store });
      const submitted = await submitDraftWithAmount(commands, 30000);
      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });

      // The flow loses its guard after the claim is already in flight: the
      // claim keeps the policy under which it was submitted.
      store.setPublishedFlow({
        ...flow,
        steps: [roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      });

      const reloaded = await commands.getClaim(employee.id, submitted.id);
      expect(reloaded.steps[0]).toMatchObject({ status: "skipped" });
      expect(reloaded.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(1);
    });

    it("re-evaluates the guard on a fresh submission after a rejection", async () => {
      const flow = guardedFlow([{ operator: "gte", amountMinor: 500000 }]);
      const store = new FlowEditingStore(flow, BASE_EMPLOYEES);
      const { commands } = buildCommands({ store });
      const rejected = await submitDraftWithAmount(commands, 30000);
      expect(rejected.steps[0]).toMatchObject({ status: "skipped" });
      // The manager step was auto-skipped, so the claim is now assigned to
      // the next pending stage's actor (the Finance Head), who rejects it.
      await commands.rejectClaim("emp-pramod", rejected.id, "Not eligible for reimbursement");

      // The guard loosens to ₹100 between the rejection and the fresh
      // submission: the new claim is evaluated against the policy in force
      // at its own submission, so the step now runs.
      store.setPublishedFlow({
        ...flow,
        steps: [guardedStep(ROLE_MANAGER.id, "gte", 10000), roleStep(ROLE_FINANCE_HEAD.id), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
      });
      const resubmitted = await submitDraftWithAmount(commands, 30000);

      expect(resubmitted.steps[0]).toMatchObject({ status: "pending", assignedActorId: "emp-ada" });
      expect(resubmitted.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(0);

      const oldClaim = await commands.getClaim(employee.id, rejected.id);
      expect(oldClaim.status).toBe("rejected");
      expect(oldClaim.steps[0]).toMatchObject({ status: "skipped" });
    });

    it("never auto-skips the terminal step by a guard, even when the guard would skip it", async () => {
      const { commands } = buildCommands({
        flows: [
          {
            id: "flow-guarded-terminal",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              guardedStep(ROLE_MANAGER.id, "gte", 500000),
              guardedStep(ROLE_FINANCE_EXECUTIVE.id, "gte", 500000),
            ],
          },
        ],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[1]).toMatchObject({ status: "pending", assignedActorId: "emp-finance" });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(submitted.history.filter((event) => event.kind === "auto-skipped")).toHaveLength(1);
      expect(submitted.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹300 under ₹5000 guard on Manager step",
      );
    });

    it("auto-skips multiple consecutive guarded steps that all fail, landing on the first pending step after them", async () => {
      const { commands } = buildCommands({
        flows: [
          {
            id: "flow-double-guarded",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              guardedStep(ROLE_MANAGER.id, "gte", 500000),
              guardedStep(ROLE_FINANCE_HEAD.id, "gte", 500000),
              roleStep(ROLE_FINANCE_EXECUTIVE.id),
            ],
          },
        ],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      expect(submitted.steps[0]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[1]).toMatchObject({ status: "skipped" });
      expect(submitted.steps[2]).toMatchObject({ status: "pending", assignedActorId: "emp-finance" });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(submitted.history.map((event) => event.kind)).toEqual(["draft", "submitted", "auto-skipped", "auto-skipped"]);
    });

    it("auto-skips a guarded team-lead step, naming the step 'team lead' in the reason", async () => {
      const { commands } = buildCommands({
        flows: [
          {
            id: "flow-team-lead-guarded",
            roleId: ROLE_EXECUTIVE.id,
            steps: [guardedTeamLeadStep("gte", 500000), roleStep(ROLE_FINANCE_EXECUTIVE.id)],
          },
        ],
      });

      const submitted = await submitDraftWithAmount(commands, 30000);

      expect(submitted.steps[0]).toMatchObject({ roleId: null, status: "skipped" });
      expect(submitted).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(submitted.history.find((event) => event.kind === "auto-skipped")?.detail).toBe(
        "Total ₹300 under ₹5000 guard on team lead step",
      );
    });
  });

  describe("delegation (ADR-0017)", () => {
    const superadmin = emp("emp-super", "Super Boss", ROLE_SUPERADMIN);

    it("is Superadmin-only: a Finance Head cannot delegate a claim", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);

      await expect(commands.delegateClaim("emp-pramod", submitted.id, "emp-finance", "Handover")).rejects.toMatchObject({
        code: "unauthorized",
        message: "Only Superadmin can delegate a claim.",
      });
    });

    it("re-points the current stage to the delegatee without changing the flow", async () => {
      const { commands } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES,
          superadmin,
          emp("emp-ada-2", "Another Manager", ROLE_MANAGER, { departmentId: "dept-eng" }),
        ],
      });
      const submitted = await submitStandardDraft(commands);

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-ada-2", "Ada is on leave");

      expect(delegated).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada-2",
      });
      // The flow keeps its position: every step stays pending and only the
      // current step's assigned actor changes.
      expect(delegated.steps.map((step) => step.status)).toEqual(["pending", "pending", "pending"]);
      expect(delegated.steps[0].assignedActorId).toBe("emp-ada-2");
      expect(delegated.history).toHaveLength(submitted.history.length + 1);
      const delegatedEvent = delegated.history.at(-1);
      expect(delegatedEvent).toMatchObject({
        kind: "delegated",
        actorId: superadmin.id,
        detail: 'Delegated to Another Manager (Manager) for "Ada is on leave"',
      });
      expect(delegated.history.filter((event) => event.kind === "skipped")).toHaveLength(0);
    });

    it("requires a reason", async () => {
      const { commands } = buildCommands({ employees: [...BASE_EMPLOYEES, superadmin] });
      const submitted = await submitStandardDraft(commands);

      await expect(commands.delegateClaim(superadmin.id, submitted.id, "emp-finance", "   ")).rejects.toMatchObject({
        code: "validation",
        message: "A reason is required to delegate a claim.",
      });
    });

    it("refuses drafts and terminal claims", async () => {
      const { commands } = buildCommands({ employees: [...BASE_EMPLOYEES, superadmin] });
      const draft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 240000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      await expect(commands.delegateClaim(superadmin.id, draft.id, "emp-ada", "Handover")).rejects.toMatchObject({
        code: "conflict",
        message: "Only an in-flight claim can be delegated.",
      });

      const submitted = await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", submitted.id, "Not eligible");
      await expect(commands.delegateClaim(superadmin.id, submitted.id, "emp-ada", "Handover")).rejects.toMatchObject({
        code: "conflict",
      });

      const paid = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", paid.id);
      await commands.approveStage("emp-pramod", paid.id);
      await commands.verifyClaim("emp-finance", paid.id);
      await commands.markPaid("emp-finance", paid.id);
      await expect(commands.delegateClaim(superadmin.id, paid.id, "emp-finance", "Handover")).rejects.toMatchObject({
        code: "conflict",
      });
    });

    it("positionally auto-skips the intermediate pending steps, one skipped event each, and lands at the delegatee's later step", async () => {
      const { commands } = buildCommands({ employees: [...BASE_EMPLOYEES, superadmin] });
      const submitted = await submitStandardDraft(commands);

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-finance", "Finance wants it early");

      expect(delegated).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance",
      });
      expect(delegated.steps[0]).toMatchObject({ status: "skipped", assignedActorId: "emp-ada" });
      expect(delegated.steps[1]).toMatchObject({ status: "skipped", assignedActorId: "emp-pramod" });
      expect(delegated.steps[2]).toMatchObject({ status: "pending", assignedActorId: "emp-finance" });
      const delegatedEvent = delegated.history.find((event) => event.kind === "delegated");
      expect(delegatedEvent).toMatchObject({ actorId: superadmin.id });
      expect(delegatedEvent?.detail).toContain('for "Finance wants it early"');
      // One skipped event per intermediate step, each naming the delegation.
      const skippedEvents = delegated.history.filter((event) => event.kind === "skipped");
      expect(skippedEvents).toHaveLength(2);
      expect(skippedEvents[0]?.detail).toBe("Skipped: delegated to Rishikesh");
      expect(skippedEvents[1]?.detail).toBe("Skipped: delegated to Rishikesh");
      expect(delegated.history.at(-1)).toMatchObject({ kind: "skipped" });
    });

    it("never lands a positional delegation on an amount-guard auto-skipped step: the target acts at the current stage instead", async () => {
      const { commands } = buildCommands({
        employees: [...BASE_EMPLOYEES, superadmin],
        flows: [
          {
            id: "flow-guarded-head",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              roleStep(ROLE_MANAGER.id),
              guardedStep(ROLE_FINANCE_HEAD.id, "gte", 500000),
              roleStep(ROLE_FINANCE_EXECUTIVE.id),
            ],
          },
        ],
      });
      const submitted = await submitDraftWithAmount(commands, 30000);
      expect(submitted.steps[1]).toMatchObject({ status: "skipped" });

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-pramod", "Heads up");

      // The Finance Head step was already decided at submission, so the
      // delegation cannot land there: the person swaps at the current stage.
      expect(delegated).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-pramod",
      });
      expect(delegated.steps[0]).toMatchObject({ status: "pending", assignedActorId: "emp-pramod" });
      expect(delegated.steps[1]).toMatchObject({ status: "skipped" });
      expect(delegated.history.filter((event) => event.kind === "skipped")).toHaveLength(0);
    });

    it("does not re-stamp or duplicate the skipped event for an intermediate step already auto-skipped by an amount guard", async () => {
      const { commands } = buildCommands({
        employees: [...BASE_EMPLOYEES, superadmin],
        flows: [
          {
            id: "flow-guarded-middle",
            roleId: ROLE_EXECUTIVE.id,
            steps: [
              roleStep(ROLE_MANAGER.id),
              guardedStep(ROLE_FINANCE_HEAD.id, "gte", 500000),
              roleStep(ROLE_FINANCE_EXECUTIVE.id),
            ],
          },
        ],
      });
      const submitted = await submitDraftWithAmount(commands, 30000);
      expect(submitted.steps[1]).toMatchObject({ status: "skipped" });
      const guardSkipDecidedAt = submitted.steps[1].decidedAt;
      const guardSkipEventCount = submitted.history.filter((event) => event.kind === "skipped").length;

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-finance", "Send to finance");

      expect(delegated.steps[0]).toMatchObject({ status: "skipped", assignedActorId: "emp-ada" });
      expect(delegated.steps[1]).toMatchObject({ status: "skipped", decidedAt: guardSkipDecidedAt });
      expect(delegated.steps[2]).toMatchObject({ status: "pending", assignedActorId: "emp-finance" });
      const skippedEvents = delegated.history.filter((event) => event.kind === "skipped");
      expect(skippedEvents).toHaveLength(guardSkipEventCount + 1);
    });

    it("re-points the terminal finance stage person in place", async () => {
      const { commands } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES,
          superadmin,
          emp("emp-finance-2", "Finance Two", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
        ],
      });
      const submitted = await submitStandardDraft(commands);
      await commands.approveStage("emp-ada", submitted.id);
      await commands.approveStage("emp-pramod", submitted.id);

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-finance-2", "Verify for me");

      expect(delegated).toMatchObject({
        status: "in-finance",
        currentStage: ROLE_FINANCE_EXECUTIVE.id,
        currentActorId: "emp-finance-2",
      });
      expect(delegated.steps[2]).toMatchObject({ status: "pending", assignedActorId: "emp-finance-2" });
      expect(delegated.history.filter((event) => event.kind === "skipped")).toHaveLength(0);
      expect(delegated.history.find((event) => event.kind === "delegated")?.detail).toContain("Finance Two");
    });

    it("keeps a held claim held after delegation: the new actor resumes it", async () => {
      const { commands } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES.map((candidate) =>
            candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
          ),
          superadmin,
          emp("emp-ada-2", "Another Manager", ROLE_MANAGER, { departmentId: "dept-eng" }),
        ],
      });
      const submitted = await submitStandardDraft(commands);
      await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-ada-2", "Ada is unreachable");

      expect(delegated.heldAt).toBe("2026-08-04T10:00:00.000Z");
      expect(delegated.heldBy).toBe("emp-ada");
      expect(delegated.heldReason).toBe("Awaiting the missing invoice");
      expect(delegated).toMatchObject({ currentActorId: "emp-ada-2", status: "in-approval" });
      expect(delegated.steps[0].assignedActorId).toBe("emp-ada-2");
    });

    it("refuses an inactive delegatee", async () => {
      const { commands } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES,
          superadmin,
          emp("emp-gone", "Gone Person", ROLE_MANAGER, { departmentId: "dept-eng", active: false }),
        ],
      });
      const submitted = await submitStandardDraft(commands);

      await expect(commands.delegateClaim(superadmin.id, submitted.id, "emp-gone", "Handover")).rejects.toMatchObject({
        code: "validation",
        message: "Choose an active employee to delegate to.",
      });
    });

    it("refuses to delegate to the requester, the current actor, or the delegator", async () => {
      const { commands } = buildCommands({
        employees: [
          ...BASE_EMPLOYEES,
          superadmin,
          emp("emp-ada-2", "Another Manager", ROLE_MANAGER, { departmentId: "dept-eng" }),
        ],
      });
      const submitted = await submitStandardDraft(commands);

      await expect(commands.delegateClaim(superadmin.id, submitted.id, employee.id, "To requester")).rejects.toMatchObject({
        code: "unauthorized",
        message: "A claim cannot be delegated to its requester.",
      });
      await expect(commands.delegateClaim(superadmin.id, submitted.id, "emp-ada", "No-op")).rejects.toMatchObject({
        code: "validation",
        message: "Choose a different person to delegate to.",
      });
      await expect(commands.delegateClaim(superadmin.id, submitted.id, superadmin.id, "To self")).rejects.toMatchObject({
        code: "validation",
        message: "Choose a different person to delegate to.",
      });
    });

    it("honors a cross-department Manager delegated onto the current Manager stage", async () => {
      const { commands } = buildCommands({
        employees: [...BASE_EMPLOYEES, superadmin, emp("emp-other-dept", "Other Dept Manager", ROLE_MANAGER, { departmentId: "dept-finance" })],
      });
      const submitted = await submitStandardDraft(commands);

      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-other-dept", "Temporary cover");

      expect(delegated).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-other-dept",
      });
      expect(delegated.steps[0].assignedActorId).toBe("emp-other-dept");
      // The delegated assignee acts even though isEligible limits Manager
      // steps to the requester's department (ADR-0017: only the person
      // changes; the re-pointed actor is honored at their landed stage).
      await expect(commands.approveStage("emp-other-dept", submitted.id)).resolves.toMatchObject({
        currentStage: ROLE_FINANCE_HEAD.id,
        currentActorId: "emp-pramod",
      });
    });

    it("rejects a privilege-less delegatee at a role stage before anything is written", async () => {
      const { commands } = buildCommands({
        employees: [...BASE_EMPLOYEES, superadmin, emp("emp-katherine", "Katherine Johnson", ROLE_EXECUTIVE, { departmentId: "dept-eng" })],
      });
      const submitted = await submitStandardDraft(commands);

      await expect(commands.delegateClaim(superadmin.id, submitted.id, "emp-katherine", "Temporary cover")).rejects.toMatchObject({
        code: "validation",
        message: "The target's role has no action privileges, so they cannot act on this claim's stage.",
      });
      const claim = await commands.getClaim(employee.id, submitted.id);
      expect(claim.steps[0].assignedActorId).toBe("emp-ada");
      expect(claim.history.some((event) => event.kind === "delegated")).toBe(false);
    });

    it("positionally lands a team-lead-flow delegation on the delegatee's later role step", async () => {
      const intern = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
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
          superadmin,
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const submitted = await commands.submitClaim(intern.id, draft.id);

      // The manager's role sits at step 1, so the delegation skips the
      // team-lead step and lands the claim at the Manager stage.
      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-ada", "Abilash is out");

      expect(delegated).toMatchObject({
        status: "in-approval",
        currentStage: ROLE_MANAGER.id,
        currentActorId: "emp-ada",
      });
      expect(delegated.steps[0]).toMatchObject({ status: "skipped", roleId: null });
      expect(delegated.steps[1]).toMatchObject({ status: "pending", assignedActorId: "emp-ada" });
      expect(delegated.history.filter((event) => event.kind === "skipped")).toHaveLength(1);
      expect(delegated.history.find((event) => event.kind === "skipped")?.detail).toBe(
        "Skipped: delegated to Ada Lovelace",
      );
    });

    it("re-points a team-lead stage to a role-less named person without moving the flow", async () => {
      const intern = emp("emp-intern", "Ananya Iyer", ROLE_INTERN, {
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
          emp("emp-helper", "Helper Person", null),
          superadmin,
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      const submitted = await commands.submitClaim(intern.id, draft.id);

      // A role-less target appears nowhere in the flow: the claim stays at
      // the team-lead stage and only the person changes.
      const delegated = await commands.delegateClaim(superadmin.id, submitted.id, "emp-helper", "Cover for Abilash");

      expect(delegated).toMatchObject({
        status: "in-approval",
        currentStage: undefined,
        currentActorId: "emp-helper",
      });
      expect(delegated.steps[0]).toMatchObject({ status: "pending", roleId: null, assignedActorId: "emp-helper" });
      expect(delegated.history.filter((event) => event.kind === "skipped")).toHaveLength(0);
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
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });
      await commands.submitClaim(employee.id, draft.id);
      await commands.rejectClaim("emp-ada", draft.id, "Not eligible for reimbursement");

      const newDraft = await commands.createDraft(employee.id, {
        title: "Client dinner",
        category: "Meals",
        amountMinor: 24000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
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

  describe("getExpenseSummary", () => {
    it("returns the claim, employees, and receipt, masking comments away from non-finance viewers", async () => {
      const { commands } = buildCommands();
      const submitted = await submitStandardDraft(commands);
      await commands.updateComments("emp-finance", submitted.id, "Awaiting invoice copy before payout");

      const requester = await commands.getExpenseSummary(employee.id, submitted.id);
      expect(requester.claim.id).toBe(submitted.id);
      expect(requester.claim.comments).toBe("Awaiting invoice copy before payout");
      expect(requester.employees.length).toBeGreaterThan(0);
      // Submission now requires a receipt (ADR-0022), so a submitted claim
      // always carries one into the summary.
      expect(requester.receipt).toMatchObject({ fileName: "receipt.pdf" });

      const approver = await commands.getExpenseSummary("emp-ada", submitted.id);
      expect(approver.claim.comments).toBeUndefined();

      const finance = await commands.getExpenseSummary("emp-finance", submitted.id);
      expect(finance.claim.comments).toBe("Awaiting invoice copy before payout");
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
        expect.objectContaining({ claimId: submitted.id, kind: "submitted", actorId: "emp-shameel" }),
        expect.objectContaining({ claimId: submitted.id, kind: "rejected", actorId: "emp-ada", actorName: "Ada Lovelace" }),
      ]);
    });

    it("denies the organization activity feed to Finance Executive and ordinary employees", async () => {
      const { commands } = buildWithFinanceHead();

      await expect(commands.listOrganizationActivity("emp-finance")).rejects.toMatchObject({ code: "unauthorized" });
      await expect(commands.listOrganizationActivity(employee.id)).rejects.toMatchObject({ code: "unauthorized" });
    });

    it("gives Finance Head the same standing oversight as Finance: comments and any employee's activity", async () => {
      const { commands } = buildWithFinanceHead();
      const draft = await commands.createDraft(employee.id, {
        title: "Bengaluru client flight",
        category: "Travel",
        amountMinor: 1250000,
        currency: "INR",
        expenseDate: "2026-08-04",
        attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
      });

      const commented = await commands.updateComments("emp-pramod", draft.id, "Approved for payout");
      expect(commented.comments).toBe("Approved for payout");

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

// Hold state (ADR-0016): a claim pauses at its current stage when the
// current actor's role carries the hold privilege and a reason is given.
// Roles below mirror the manager/finance-executive ids so the STANDARD_FLOW
// eligibility checks pass while carrying the can_hold capability.
const ROLE_HOLD_MANAGER = {
  id: ROLE_MANAGER.id,
  code: "manager",
  displayName: "Manager",
  capabilities: { ...SUBMIT_ONLY, canApprove: true, canHold: true },
};
const ROLE_HOLD_FINANCE = {
  id: ROLE_FINANCE_EXECUTIVE.id,
  code: "finance-executive",
  displayName: "Finance Executive",
  capabilities: { ...SUBMIT_ONLY, canAccessFinance: true, canHold: true },
};

describe("hold and resume", () => {
  it("lets the current stage actor with the hold privilege pause a claim, recording a held event with the reason", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);

    const held = await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

    expect(held).toMatchObject({
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
      currentActorId: "emp-ada",
      heldAt: "2026-08-04T10:00:00.000Z",
      heldBy: "emp-ada",
      heldReason: "Awaiting the missing invoice",
      version: submitted.version + 1,
    });
    expect(held.history.map((event) => event.kind)).toEqual(["draft", "submitted", "held"]);
    expect(held.history[2]).toMatchObject({
      kind: "held",
      actorId: "emp-ada",
      detail: "Awaiting the missing invoice",
    });
  });

  it("rejects a hold from an actor who is not the current stage actor", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);

    await expect(
      commands.holdClaim("emp-katherine", submitted.id, "Let me look at this"),
    ).rejects.toMatchObject({
      code: "unauthorized",
      message: "This expense claim is not assigned to you.",
    });
  });

  it("rejects a hold from the claim's requester", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.holdClaim(employee.id, submitted.id, "My own claim")).rejects.toMatchObject({
      code: "unauthorized",
      message: "You cannot hold your own expense claim.",
    });
  });

  it("rejects a hold when the actor's role lacks the can_hold capability", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.holdClaim("emp-ada", submitted.id, "Awaiting docs")).rejects.toMatchObject({
      code: "unauthorized",
      message: "Your role does not have the hold privilege.",
    });
  });

  it("requires a non-empty reason to hold", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);

    await expect(commands.holdClaim("emp-ada", submitted.id, "   ")).rejects.toMatchObject({
      code: "validation",
      message: "A reason is required to hold a claim.",
    });
  });

  it("rejects holding an already-held claim", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "First hold");

    await expect(commands.holdClaim("emp-ada", submitted.id, "Second hold")).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is already held.",
    });
  });

  it("only holds an in-flight claim, never a draft or a terminal one", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const draft = await commands.createDraft(employee.id, {
      title: "Client dinner",
      category: "Meals",
      amountMinor: 240000,
      currency: "INR",
      expenseDate: "2026-08-04",
    });

    await expect(commands.holdClaim("emp-ada", draft.id, "Pause the draft")).rejects.toMatchObject({
      code: "conflict",
      message: "Only an in-flight claim can be held.",
    });
  });

  it("freezes approve and reject while the claim is held", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Holding for review");

    await expect(commands.approveStage("emp-ada", submitted.id)).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is held and cannot be acted on until it is resumed.",
    });
    await expect(commands.rejectClaim("emp-ada", submitted.id, "Too expensive")).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is held and cannot be acted on until it is resumed.",
    });
  });

  it("freezes verify and pay while a terminal-stage claim is held", async () => {
    const { commands } = buildCommands({
      employees: [
        ...BASE_EMPLOYEES.map((candidate) =>
          candidate.id === "emp-finance" ? { ...candidate, role: ROLE_HOLD_FINANCE } : candidate,
        ),
        emp("emp-rishikesh", "Rishikesh 2", ROLE_HOLD_FINANCE, { departmentId: "dept-finance" }),
      ],
    });
    const submitted = await submitStandardDraft(commands);
    await commands.approveStage("emp-ada", submitted.id);
    await commands.approveStage("emp-pramod", submitted.id);
    const inFinance = await commands.getClaim(employee.id, submitted.id);
    expect(inFinance).toMatchObject({ status: "in-finance", currentActorId: "emp-finance" });

    const held = await commands.holdClaim("emp-finance", submitted.id, "Receipt is being rechecked");

    await expect(commands.verifyClaim("emp-finance", held.id)).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is held and cannot be acted on until it is resumed.",
    });
    // A pool member who is not the assigned actor is also frozen.
    await expect(commands.verifyClaim("emp-rishikesh", held.id)).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is held and cannot be acted on until it is resumed.",
    });

    // A claim verified before the hold is equally frozen against payment.
    const verifiedThenHeld = await submitStandardDraft(commands);
    await commands.approveStage("emp-ada", verifiedThenHeld.id);
    await commands.approveStage("emp-pramod", verifiedThenHeld.id);
    await commands.verifyClaim("emp-finance", verifiedThenHeld.id);
    await commands.holdClaim("emp-finance", verifiedThenHeld.id, "Payment block under review");

    await expect(commands.markPaid("emp-finance", verifiedThenHeld.id)).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is held and cannot be acted on until it is resumed.",
    });
  });

  it("resumes a held claim as its current stage actor, recording a resumed event and clearing the hold", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

    const resumed = await commands.resumeClaim("emp-ada", submitted.id);

    expect(resumed).toMatchObject({
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
      currentActorId: "emp-ada",
      heldAt: undefined,
      heldBy: undefined,
      heldReason: undefined,
    });
    expect(resumed.history.map((event) => event.kind)).toEqual(["draft", "submitted", "held", "resumed"]);
    expect(resumed.history[3]).toMatchObject({ kind: "resumed", actorId: "emp-ada" });
    // The hold pauses the absence clock: resume starts a fresh window.
    expect(resumed.currentStageSince).toBe("2026-08-04T10:00:00.000Z");
  });

  it("rejects a resume from an actor who is not the current stage actor", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Awaiting docs");

    await expect(commands.resumeClaim("emp-katherine", submitted.id)).rejects.toMatchObject({
      code: "unauthorized",
      message: "This expense claim is not assigned to you.",
    });
  });

  it("rejects resuming a claim that is not held", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);

    await expect(commands.resumeClaim("emp-ada", submitted.id)).rejects.toMatchObject({
      code: "conflict",
      message: "This claim is not held.",
    });
  });

  it("rejects resuming a claim that left the flow", async () => {
    const { commands } = buildCommands();
    const submitted = await submitStandardDraft(commands);
    await commands.approveStage("emp-ada", submitted.id);
    await commands.approveStage("emp-pramod", submitted.id);
    await commands.verifyClaim("emp-finance", submitted.id);
    const paid = await commands.markPaid("emp-finance", submitted.id);

    await expect(commands.resumeClaim("emp-finance", paid.id)).rejects.toMatchObject({
      code: "conflict",
      message: "Only an in-flight claim can be resumed.",
    });
  });

  it("unfreezes the claim after resume: the same actor can then decide", async () => {
    const { commands } = buildCommands({
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Held for review");
    await commands.resumeClaim("emp-ada", submitted.id);

    await expect(commands.approveStage("emp-ada", submitted.id)).resolves.toMatchObject({
      currentStage: ROLE_FINANCE_HEAD.id,
      currentActorId: "emp-pramod",
    });
  });

  it("never auto-skips a held claim in the absence sweep, even far past the timeout", async () => {
    let clock = new Date("2026-08-04T10:00:00.000Z");
    const { commands } = buildCommands({
      now: () => clock,
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

    clock = new Date("2026-09-30T10:00:00.000Z");
    const advanced = await commands.sweepAbsentClaims("org-1");

    expect(advanced).toEqual([]);
    await expect(commands.getClaim(employee.id, submitted.id)).resolves.toMatchObject({
      status: "in-approval",
      currentStage: ROLE_MANAGER.id,
      currentActorId: "emp-ada",
      heldAt: "2026-08-04T10:00:00.000Z",
    });
  });

  it("gives the resumed stage a fresh absence window, so a long hold never sweeps it on resume", async () => {
    let clock = new Date("2026-08-04T10:00:00.000Z");
    const { commands } = buildCommands({
      now: () => clock,
      employees: BASE_EMPLOYEES.map((candidate) =>
        candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
      ),
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

    // The hold runs for two months; the stage times out long ago, but the
    // claim is exempt while held.
    clock = new Date("2026-10-04T10:00:00.000Z");
    const resumed = await commands.resumeClaim("emp-ada", submitted.id);
    expect(resumed.currentStageSince).toBe("2026-10-04T10:00:00.000Z");

    // Two days after resume: inside the fresh 3-day window, no sweep.
    clock = new Date("2026-10-06T10:00:00.000Z");
    const advanced = await commands.sweepAbsentClaims("org-1");
    expect(advanced).toEqual([]);
  });

  it("lists every held claim with resolved names for the admin console", async () => {
    const { commands } = buildCommands({
      employees: [
        ...BASE_EMPLOYEES.map((candidate) =>
          candidate.id === "emp-ada" ? { ...candidate, role: ROLE_HOLD_MANAGER } : candidate,
        ),
        emp("emp-super", "Super Boss", ROLE_SUPERADMIN),
      ],
    });
    const submitted = await submitStandardDraft(commands);
    await commands.holdClaim("emp-ada", submitted.id, "Awaiting the missing invoice");

    await expect(commands.listHeldClaims("emp-super")).resolves.toEqual([
      {
        claimId: submitted.id,
        ref: submitted.ref,
        title: "Client dinner",
        heldBy: "Ada Lovelace",
        heldReason: "Awaiting the missing invoice",
        heldAt: "2026-08-04T10:00:00.000Z",
        stage: "Manager",
      },
    ]);
  });

  it("rejects the held-claims list even for a console-capable non-Superadmin role", async () => {
    const consoleRole = {
      id: "role-console",
      code: "admin-console",
      displayName: "Console Admin",
      capabilities: { ...SUBMIT_ONLY, canAccessAdminConsole: true },
    };
    const consoleAdmin = emp("emp-console", "Console Admin", consoleRole, { departmentId: "dept-eng" });
    const { commands } = buildCommands({
      employees: [...BASE_EMPLOYEES, consoleAdmin],
    });

    await expect(commands.listHeldClaims("emp-console")).rejects.toMatchObject({
      code: "unauthorized",
      message: "Only Superadmin can view held claims.",
    });
  });

  it("resolves a team-lead stage label for a held claim without a role id", async () => {
    const teamLeadRequester = emp("emp-team-requester", "Team Requester", ROLE_EXECUTIVE, {
      managerId: "emp-abilash",
    });
    const teamLeadAssignee = emp("emp-abilash", "Abilash", {
      id: "role-team-lead",
      code: "team-lead",
      displayName: "Team Lead",
      capabilities: { ...SUBMIT_ONLY, canHold: true },
    });
    const financeExec = emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" });
    const superadmin = emp("emp-super", "Super Boss", ROLE_SUPERADMIN);
    const { commands } = buildCommands({
      employees: [teamLeadRequester, teamLeadAssignee, financeExec, superadmin],
      flows: [
        {
          id: "flow-team-lead",
          roleId: ROLE_EXECUTIVE.id,
          steps: [TEAM_LEAD_STEP, roleStep(ROLE_FINANCE_EXECUTIVE.id)],
        },
      ],
    });
    const draft = await commands.createDraft(teamLeadRequester.id, {
      title: "Team lead claim",
      category: "Meals",
      amountMinor: 10000,
      currency: "INR",
      expenseDate: "2026-08-04",
      attachment: { fileName: "receipt.pdf", contentType: "application/pdf", data: PDF_RECEIPT },
    });
    const submitted = await commands.submitClaim(teamLeadRequester.id, draft.id);
    await commands.holdClaim("emp-abilash", submitted.id, "Need more detail");

    await expect(commands.listHeldClaims("emp-super")).resolves.toEqual([
      {
        claimId: submitted.id,
        ref: submitted.ref,
        title: "Team lead claim",
        heldBy: "Abilash",
        heldReason: "Need more detail",
        heldAt: "2026-08-04T10:00:00.000Z",
        stage: "Team lead",
      },
    ]);
  });
});

describe("previewFlowSteps", () => {
  it("returns the display names of the published flow for the caller's role", async () => {
    const { commands } = buildCommands();
    expect(await commands.previewFlowSteps(employee.id)).toEqual([
      "Manager",
      "Finance Head",
      "Finance Executive",
    ]);
  });

  it("labels a team-lead step as Team lead", async () => {
    const intern = emp("emp-intern", "Intern Kid", ROLE_INTERN);
    const { commands } = buildCommands({
      employees: [
        employee,
        intern,
        emp("emp-ada", "Ada Lovelace", ROLE_MANAGER),
        emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD),
      ],
      flows: [
        {
          id: "flow-intern",
          roleId: ROLE_INTERN.id,
          steps: [TEAM_LEAD_STEP, roleStep(ROLE_MANAGER.id), roleStep(ROLE_FINANCE_HEAD.id)],
        },
      ],
    });
    expect(await commands.previewFlowSteps(intern.id)).toEqual(["Team lead", "Manager", "Finance Head"]);
  });

  it("returns an empty array when no flow is published for the role", async () => {
    const { commands } = buildCommands({ flows: [] });
    expect(await commands.previewFlowSteps(employee.id)).toEqual([]);
  });

  it("returns an empty array for an employee without a role", async () => {
    const roleless = emp("emp-roleless", "No Role", null);
    const { commands } = buildCommands({
      employees: [roleless, emp("emp-ada", "Ada Lovelace", ROLE_MANAGER)],
    });
    expect(await commands.previewFlowSteps(roleless.id)).toEqual([]);
  });
});
