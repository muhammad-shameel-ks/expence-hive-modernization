import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryBlobStore } from "../blob/fakes";
import { createExpenseCommands } from "./commands";
import {
  handleApproveExpenseRequest,
  handleCreateExpenseRequest,
  handleDeleteExpenseRequest,
  handleFinancePaymentQueueRequest,
  handleGetExpenseRequest,
  handleGetReceiptRequest,
  handleRejectExpenseRequest,
  handleSubmitExpenseRequest,
  handleTakeOverExpenseRequest,
  handleUpdateCommentsRequest,
  handleUpdateExpenseRequest,
} from "./http";
import { InMemoryExpenseStore } from "./in-memory";
import type { ExpenseEmployee } from "./ports";
import { MAX_RECEIPT_SIZE_BYTES } from "./receipt-validation";

const ROLE_EXECUTIVE = { id: "role-executive", code: "executive", displayName: "Executive" };
const ROLE_MANAGER = { id: "role-manager", code: "manager", displayName: "Manager" };
const ROLE_FINANCE_HEAD = { id: "role-finance-head", code: "finance-head", displayName: "Finance Head" };
const ROLE_FINANCE_EXECUTIVE = { id: "role-finance-executive", code: "finance-executive", displayName: "Finance Executive" };
const ROLE_INTERN = { id: "role-intern", code: "intern", displayName: "Intern" };

function emp(
  id: string,
  name: string,
  role: ExpenseEmployee["role"],
  extra: Partial<ExpenseEmployee> = {},
): ExpenseEmployee {
  return { id, organizationId: "org-1", name, role, active: true, managerId: null, ...extra };
}

const JPEG_RECEIPT = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PDF_RECEIPT = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]); // "%PDF-1.4\n"

const BASE_FIELDS: Record<string, string> = {
  title: "Taxi",
  category: "Travel",
  subCategory: "Cab/Taxi",
  remark: "Airport pickup",
  amount: "850.00",
  expenseDate: "2026-08-04",
  accountNumber: "32534240620",
  ifscCode: "SBIN0012861",
};

function multipartBody(fields: Record<string, string>, file?: { name: string; type: string; data: Uint8Array<ArrayBuffer> }): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("receipt", new File([file.data], file.name, { type: file.type }));
  return form;
}

function createRequest(fields: Record<string, string>, file?: { name: string; type: string; data: Uint8Array<ArrayBuffer> }): Request {
  return new Request("http://localhost/api/expenses", { method: "POST", body: multipartBody(fields, file) });
}

function build() {
  const store = new InMemoryExpenseStore({
    employees: [
      emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng", managerId: "emp-ada" }),
      emp("emp-katherine", "Katherine Johnson", ROLE_EXECUTIVE, { departmentId: "dept-eng" }),
      emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
      emp("emp-sanil", "Sanil Davis", ROLE_MANAGER, { departmentId: "dept-eng" }),
      emp("emp-pramod", "Pramod", ROLE_FINANCE_HEAD, { departmentId: "dept-finance" }),
      emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
    ],
    flows: [
      {
        id: "flow-standard",
        roleId: ROLE_EXECUTIVE.id,
        steps: [
          { kind: "role", roleId: ROLE_MANAGER.id },
          { kind: "role", roleId: ROLE_FINANCE_HEAD.id },
          { kind: "role", roleId: ROLE_FINANCE_EXECUTIVE.id },
        ],
      },
    ],
  });
  const blobStore = new InMemoryBlobStore();
  const commands = createExpenseCommands({
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
    now: () => new Date("2026-08-04T10:00:00.000Z"),
  });
  return { commands, blobStore };
}

async function createAndSubmit(commands: ReturnType<typeof build>["commands"], actorId = "emp-shameel") {
  const createResponse = await handleCreateExpenseRequest(createRequest(BASE_FIELDS), commands, actorId);
  const { claim } = await createResponse.json();
  await handleSubmitExpenseRequest(
    new Request(`http://localhost/api/expenses/${claim.id}/submit`, { method: "POST" }),
    commands,
    actorId,
    claim.id,
  );
  return claim as { id: string };
}

describe("expense HTTP boundary", () => {
  it("creates a draft from rupee input and returns the persisted claim shape", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      createRequest(
        {
          title: "Client dinner",
          category: "Meals",
          subCategory: "Client Meeting",
          remark: "Dinner with Acme Corp",
          amount: "2400.00",
          expenseDate: "2026-08-04",
          accountNumber: "32534240620",
          ifscCode: "SBIN0012861",
        },
        { name: "receipt.jpg", type: "image/jpeg", data: JPEG_RECEIPT },
      ),
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
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a draft submitted with whitespace-only payout details", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "   ",
        ifscCode: "   ",
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
  });

  it("submits a draft through a protected command boundary", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      createRequest({
        title: "Taxi",
        category: "Travel",
        subCategory: "Cab/Taxi",
        remark: "Airport pickup",
        amount: "850.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      createRequest({
        title: "No receipt taxi",
        category: "Travel",
        subCategory: "Cab/Taxi",
        remark: "No receipt available",
        amount: "500.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.claim.attachment).toBeUndefined();
  });

  it("persists a valid JPEG file part as an available attachment with a server-derived key", async () => {
    const { commands, blobStore } = build();
    const response = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "boarding-pass.jpg", type: "image/jpeg", data: JPEG_RECEIPT }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.claim.attachment).toMatchObject({
      fileName: "boarding-pass.jpg",
      contentType: "image/jpeg",
      storageKey: "org-1/claim-1/attachment-1.jpg",
      status: "available",
      sizeBytes: JPEG_RECEIPT.byteLength,
    });
    expect(payload.claim.attachment.contentSha256).toBe(createHash("sha256").update(JPEG_RECEIPT).digest("hex"));
    await expect(blobStore.getBlob("org-1/claim-1/attachment-1.jpg")).resolves.toEqual({
      data: JPEG_RECEIPT,
      contentType: "image/jpeg",
    });
  });

  it("rejects a file part whose declared type does not match its bytes", async () => {
    const { commands } = build();
    const response = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "notes.txt", type: "text/plain", data: PDF_RECEIPT }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
  });

  it("rejects an oversized receipt file part with a message-bearing validation response", async () => {
    const { commands } = build();
    const bigReceipt = new Uint8Array(MAX_RECEIPT_SIZE_BYTES + 1);
    bigReceipt.set(PDF_RECEIPT);
    const response = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "huge.pdf", type: "application/pdf", data: bigReceipt }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "validation",
      message: "The receipt is larger than 10 MB.",
    });
  });

  it("rejects a create request missing a required text field", async () => {
    const { commands } = build();
    const fields = Object.fromEntries(
      Object.entries(BASE_FIELDS).filter(([key]) => key !== "accountNumber"),
    );
    const response = await handleCreateExpenseRequest(createRequest(fields), commands, "emp-shameel");

    expect(response.status).toBe(422);
  });

  it("rejects an oversized request body from content-length before buffering it", async () => {
    const { commands, blobStore } = build();
    // Browsers always send content-length for multipart form posts; the
    // handler must reject an oversized body from that header without
    // buffering it. (undici omits the header on synthetic Requests, so the
    // test sets it explicitly, like a browser would.)
    const form = multipartBody(BASE_FIELDS, { name: "huge.pdf", type: "application/pdf", data: PDF_RECEIPT });
    const response = await handleCreateExpenseRequest(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        body: form,
        headers: { "content-length": String(MAX_RECEIPT_SIZE_BYTES + 2 * 1024 * 1024) },
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: "too-large",
      message: "The receipt is larger than 10 MB.",
    });
    expect(blobStore.getBlob("org-1/claim-1/attachment-1.pdf")).resolves.toBeNull();
  });

  it("serves the receipt bytes to the requester with the right headers", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "boarding-pass.jpg", type: "image/jpeg", data: JPEG_RECEIPT }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();

    const response = await handleGetReceiptRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/receipt`),
      commands,
      "emp-shameel",
      claim.id,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(JPEG_RECEIPT.byteLength));
    expect(response.headers.get("content-disposition")).toBe('inline; filename="boarding-pass.jpg"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.arrayBuffer()).resolves.toEqual(JPEG_RECEIPT.buffer);
  });

  it("denies the receipt to an employee of another organization", async () => {
    const store = new InMemoryExpenseStore({
      employees: [
        emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng" }),
        {
          id: "emp-outsider",
          organizationId: "org-2",
          name: "Outsider",
          role: ROLE_EXECUTIVE,
          active: true,
          managerId: null,
        },
      ],
      flows: [],
    });
    const commands = createExpenseCommands({
      store,
      blobStore: new InMemoryBlobStore(),
      idFactory: (() => {
        const counters = new Map<string, number>();
        return (prefix: string) => {
          const next = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, next);
          return `${prefix}-${next}`;
        };
      })(),
      now: () => new Date("2026-08-04T10:00:00.000Z"),
    });
    const createResponse = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "receipt.jpg", type: "image/jpeg", data: JPEG_RECEIPT }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();

    const response = await handleGetReceiptRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/receipt`),
      commands,
      "emp-outsider",
      claim.id,
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when the receipt blob is missing from the store", async () => {
    const { commands, blobStore } = build();
    const createResponse = await handleCreateExpenseRequest(
      createRequest(BASE_FIELDS, { name: "receipt.jpg", type: "image/jpeg", data: JPEG_RECEIPT }),
      commands,
      "emp-shameel",
    );
    const { claim } = await createResponse.json();
    await blobStore.deleteBlob(claim.attachment.storageKey);

    const response = await handleGetReceiptRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/receipt`),
      commands,
      "emp-shameel",
      claim.id,
    );

    expect(response.status).toBe(404);
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
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      createRequest({
        title: "Urgent client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      claim: { status: "in-finance", currentStage: ROLE_FINANCE_EXECUTIVE.id },
    });
  });

  it("rejects a take-over request without a reason code", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      createRequest({
        title: "Urgent client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      createRequest({
        title: "Conference taxi",
        category: "Travel",
        subCategory: "Cab/Taxi",
        remark: "Airport pickup",
        amount: "850.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
    await commands.approveStage("emp-pramod", claim.id);

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

  it("denies viewing a claim to someone who never touched it and is not Finance", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(
      createRequest({
        title: "Client dinner",
        category: "Meals",
        subCategory: "Client Meeting",
        remark: "Dinner with Acme Corp",
        amount: "2400.00",
        expenseDate: "2026-08-04",
        accountNumber: "32534240620",
        ifscCode: "SBIN0012861",
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
      "emp-katherine",
      claim.id,
    );

    expect(response.status).toBe(403);
  });

  it("lets a second Manager-role holder in the department approve the manager stage through HTTP", async () => {
    const { commands } = build();
    const claim = await createAndSubmit(commands);

    // emp-ada was assigned, but emp-sanil (same department, same role) is
    // equally eligible under pool semantics.
    const response = await handleApproveExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/approve`, { method: "POST" }),
      commands,
      "emp-sanil",
      claim.id,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claim: { status: "in-approval", currentStage: ROLE_FINANCE_HEAD.id },
    });
  });

  it("rejects a manager from another department who tries to approve through HTTP", async () => {
    const store = new InMemoryExpenseStore({
      employees: [
        emp("emp-shameel", "Muhammad Shameel", ROLE_EXECUTIVE, { departmentId: "dept-eng" }),
        emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
        emp("emp-arun", "Arun Kumar", ROLE_MANAGER, { departmentId: "dept-ops" }),
        emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
      ],
      flows: [
        {
          id: "flow-standard",
          roleId: ROLE_EXECUTIVE.id,
          steps: [
            { kind: "role", roleId: ROLE_MANAGER.id },
            { kind: "role", roleId: ROLE_FINANCE_EXECUTIVE.id },
          ],
        },
      ],
    });
    const commands = createExpenseCommands({
      store,
      blobStore: new InMemoryBlobStore(),
      idFactory: (() => {
        const counters = new Map<string, number>();
        return (prefix: string) => {
          const next = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, next);
          return `${prefix}-${next}`;
        };
      })(),
      now: () => new Date("2026-08-04T10:00:00.000Z"),
    });
    const claim = await createAndSubmit(commands);

    const response = await handleApproveExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/approve`, { method: "POST" }),
      commands,
      "emp-arun",
      claim.id,
    );

    expect(response.status).toBe(403);
  });

  it("routes an intern claim through the assigned team lead over HTTP", async () => {
    const store = new InMemoryExpenseStore({
      employees: [
        emp("emp-intern", "Ananya Iyer", ROLE_INTERN, { departmentId: "dept-eng", managerId: "emp-abilash" }),
        emp("emp-abilash", "Abilash", { id: "role-team-lead", code: "team-lead", displayName: "Team Lead" }, { departmentId: "dept-eng" }),
        emp("emp-ada", "Ada Lovelace", ROLE_MANAGER, { departmentId: "dept-eng" }),
        emp("emp-finance", "Rishikesh", ROLE_FINANCE_EXECUTIVE, { departmentId: "dept-finance" }),
      ],
      flows: [
        {
          id: "flow-intern",
          roleId: ROLE_INTERN.id,
          steps: [
            { kind: "team-lead" },
            { kind: "role", roleId: ROLE_MANAGER.id },
            { kind: "role", roleId: ROLE_FINANCE_EXECUTIVE.id },
          ],
        },
      ],
    });
    const commands = createExpenseCommands({
      store,
      blobStore: new InMemoryBlobStore(),
      idFactory: (() => {
        const counters = new Map<string, number>();
        return (prefix: string) => {
          const next = (counters.get(prefix) ?? 0) + 1;
          counters.set(prefix, next);
          return `${prefix}-${next}`;
        };
      })(),
      now: () => new Date("2026-08-04T10:00:00.000Z"),
    });
    const claim = await createAndSubmit(commands, "emp-intern");

    const submitBody = await handleGetExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}`),
      commands,
      "emp-intern",
      claim.id,
    );
    const body = (await submitBody.json()) as {
      claim: { steps: Array<{ roleId: string | null; assignedActorId?: string }> };
    };
    expect(body.claim.steps[0]).toMatchObject({ roleId: null, assignedActorId: "emp-abilash" });

    const approveResponse = await handleApproveExpenseRequest(
      new Request(`http://localhost/api/expenses/${claim.id}/approve`, { method: "POST" }),
      commands,
      "emp-abilash",
      claim.id,
    );

    expect(approveResponse.status).toBe(200);
    await expect(approveResponse.json()).resolves.toMatchObject({
      claim: { currentStage: ROLE_MANAGER.id },
    });
  });
});

describe("draft update and delete handlers", () => {
  function updateRequest(fields: Record<string, string>, file?: { name: string; type: string; data: Uint8Array<ArrayBuffer> }): Request {
    return new Request("http://localhost/api/expenses/claim-1", {
      method: "PATCH",
      body: multipartBody(fields, file),
    });
  }

  async function createDraft() {
    const { commands, blobStore } = build();
    const createResponse = await handleCreateExpenseRequest(createRequest(BASE_FIELDS), commands, "emp-shameel");
    const payload = (await createResponse.json()) as { claim: { id: string } };
    return { commands, blobStore, claimId: payload.claim.id };
  }

  it("updates draft fields through PATCH and returns the claim", async () => {
    const { commands, claimId } = await createDraft();

    const response = await handleUpdateExpenseRequest(
      updateRequest({ ...BASE_FIELDS, title: "Renamed taxi", amount: "999.00" }),
      commands,
      "emp-shameel",
      claimId,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      claim: { id: claimId, title: "Renamed taxi", amountMinor: 99900 },
    });
  });

  it("adds a receipt to a draft that skipped it through PATCH", async () => {
    const { commands, blobStore, claimId } = await createDraft();

    const response = await handleUpdateExpenseRequest(
      updateRequest(BASE_FIELDS, { name: "late.pdf", type: "application/pdf", data: PDF_RECEIPT }),
      commands,
      "emp-shameel",
      claimId,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { claim: { attachment: { fileName: string; storageKey: string } } };
    expect(payload.claim.attachment.fileName).toBe("late.pdf");
    await expect(blobStore.getBlob(payload.claim.attachment.storageKey)).resolves.not.toBeNull();
  });

  it("returns 422 for a malformed PATCH body", async () => {
    const { commands, claimId } = await createDraft();
    const form = new FormData();
    form.set("title", "Only a title");

    const response = await handleUpdateExpenseRequest(
      new Request("http://localhost/api/expenses/claim-1", { method: "PATCH", body: form }),
      commands,
      "emp-shameel",
      claimId,
    );

    expect(response.status).toBe(422);
  });

  it("rejects editing a submitted claim with 409", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(createRequest(BASE_FIELDS), commands, "emp-shameel");
    const payload = (await createResponse.json()) as { claim: { id: string } };
    await handleSubmitExpenseRequest(new Request("http://localhost"), commands, "emp-shameel", payload.claim.id);

    const response = await handleUpdateExpenseRequest(updateRequest(BASE_FIELDS), commands, "emp-shameel", payload.claim.id);

    expect(response.status).toBe(409);
  });

  it("rejects editing another employee's draft with 403", async () => {
    const { commands, claimId } = await createDraft();

    const response = await handleUpdateExpenseRequest(updateRequest(BASE_FIELDS), commands, "emp-katherine", claimId);

    expect(response.status).toBe(403);
  });

  it("deletes a draft and its receipt through DELETE, returning 204", async () => {
    const { commands, blobStore, claimId } = await createDraft();
    const addResponse = await handleUpdateExpenseRequest(
      updateRequest(BASE_FIELDS, { name: "late.pdf", type: "application/pdf", data: PDF_RECEIPT }),
      commands,
      "emp-shameel",
      claimId,
    );
    const payload = (await addResponse.json()) as { claim: { attachment: { storageKey: string } } };

    const deleteResponse = await handleDeleteExpenseRequest(
      new Request("http://localhost/api/expenses/claim-1", { method: "DELETE" }),
      commands,
      "emp-shameel",
      claimId,
    );

    expect(deleteResponse.status).toBe(204);
    await expect(blobStore.getBlob(payload.claim.attachment.storageKey)).resolves.toBeNull();
    const getResponse = await handleGetExpenseRequest(
      new Request("http://localhost/api/expenses/claim-1"),
      commands,
      "emp-shameel",
      claimId,
    );
    expect(getResponse.status).toBe(404);
  });

  it("rejects deleting a submitted claim with 409", async () => {
    const { commands } = build();
    const createResponse = await handleCreateExpenseRequest(createRequest(BASE_FIELDS), commands, "emp-shameel");
    const payload = (await createResponse.json()) as { claim: { id: string } };
    await handleSubmitExpenseRequest(new Request("http://localhost"), commands, "emp-shameel", payload.claim.id);

    const deleteResponse = await handleDeleteExpenseRequest(
      new Request("http://localhost/api/expenses/claim-1", { method: "DELETE" }),
      commands,
      "emp-shameel",
      payload.claim.id,
    );

    expect(deleteResponse.status).toBe(409);
  });
});
