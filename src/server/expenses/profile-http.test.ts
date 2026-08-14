import { describe, expect, it, vi } from "vitest";
import type { ProfileCommands } from "./profile";
import {
  handleApproveBankDetailRequest,
  handleGetProfileRequest,
  handleListPendingBankDetailRequestsRequest,
  handleRejectBankDetailRequest,
  handleSubmitBankDetailChangeRequest,
  handleUpdatePersonalDetailsRequest,
} from "./profile-http";
import type { BankDetailChangeRequest, BankDetails, ExpenseEmployee } from "./ports";

const EMPLOYEE: ExpenseEmployee = {
  id: "emp-shameel",
  organizationId: "org-1",
  name: "Muhammad Shameel",
  email: "shameel@hive.local",
  role: null,
  active: true,
  managerId: null,
};

const REQUEST: BankDetailChangeRequest = {
  id: "bank-change-1",
  organizationId: "org-1",
  employeeId: "emp-shameel",
  status: "pending",
  requested: {
    holderName: "Muhammad Shameel",
    accountNumber: "60123456789013",
    ifsc: "SBIN0002345",
    bankName: "State Bank of India",
    branch: "Whitefield",
  },
  requesterId: "emp-shameel",
  requestedAt: "2026-08-04T10:00:00.000Z",
  history: [{ id: "history-1", kind: "submitted", actorId: "emp-shameel", createdAt: "2026-08-04T10:00:00.000Z" }],
};

function buildCommands(overrides: Partial<ProfileCommands> = {}): ProfileCommands {
  return {
    getProfile: vi.fn().mockResolvedValue({ employee: EMPLOYEE }),
    updatePersonalDetails: vi.fn().mockResolvedValue(EMPLOYEE),
    submitBankDetailChange: vi.fn().mockResolvedValue(REQUEST),
    approveBankDetailChange: vi.fn().mockResolvedValue({ ...REQUEST, status: "approved" }),
    rejectBankDetailChange: vi.fn().mockResolvedValue({ ...REQUEST, status: "rejected" }),
    listPendingBankDetailChanges: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as ProfileCommands;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("profile HTTP boundary", () => {
  it("serves the caller's own profile read", async () => {
    const commands = buildCommands();
    const response = await handleGetProfileRequest(new Request("http://localhost/api/profile"), commands, "emp-shameel");

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      profile: { employee: { id: "emp-shameel" } },
    });
  });

  it("updates the phone from a JSON body", async () => {
    const commands = buildCommands();
    const response = await handleUpdatePersonalDetailsRequest(
      new Request("http://localhost/api/profile/personal", {
        method: "POST",
        body: JSON.stringify({ phone: "+91 98765 43210" }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(200);
    expect(commands.updatePersonalDetails).toHaveBeenCalledWith("emp-shameel", {
      phone: "+91 98765 43210",
    });
  });

  it("rejects a personal-details body without a phone string", async () => {
    const commands = buildCommands();
    const response = await handleUpdatePersonalDetailsRequest(
      new Request("http://localhost/api/profile/personal", {
        method: "POST",
        body: JSON.stringify({ phone: 42 }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
    expect(commands.updatePersonalDetails).not.toHaveBeenCalled();
  });

  it("submits a bank-detail change from a JSON body", async () => {
    const commands = buildCommands();
    const details: BankDetails = {
      holderName: "Muhammad Shameel",
      accountNumber: "60123456789013",
      ifsc: "SBIN0002345",
      bankName: "State Bank of India",
      branch: "Whitefield",
    };
    const response = await handleSubmitBankDetailChangeRequest(
      new Request("http://localhost/api/profile/bank-details", {
        method: "POST",
        body: JSON.stringify(details),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(201);
    expect(commands.submitBankDetailChange).toHaveBeenCalledWith("emp-shameel", details);
    await expect(json(response)).resolves.toMatchObject({ bankChange: { id: "bank-change-1" } });
  });

  it("rejects a bank-details body with a missing field", async () => {
    const commands = buildCommands();
    const response = await handleSubmitBankDetailChangeRequest(
      new Request("http://localhost/api/profile/bank-details", {
        method: "POST",
        body: JSON.stringify({ holderName: "X" }),
      }),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(422);
    expect(commands.submitBankDetailChange).not.toHaveBeenCalled();
  });

  it("lists pending requests for a privilege holder", async () => {
    const commands = buildCommands({
      listPendingBankDetailChanges: vi.fn().mockResolvedValue([REQUEST]),
    });
    const response = await handleListPendingBankDetailRequestsRequest(
      new Request("http://localhost/api/finance/bank-detail-requests"),
      commands,
      "emp-pramod",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      requests: [{ id: "bank-change-1" }],
    });
  });

  it("approves a request through the command", async () => {
    const commands = buildCommands();
    const response = await handleApproveBankDetailRequest(
      new Request("http://localhost/api/finance/bank-detail-requests/bank-change-1/approve", {
        method: "POST",
      }),
      commands,
      "emp-pramod",
      "bank-change-1",
    );

    expect(response.status).toBe(200);
    expect(commands.approveBankDetailChange).toHaveBeenCalledWith("emp-pramod", "bank-change-1");
  });

  it("rejects with a reason from the body", async () => {
    const commands = buildCommands();
    const response = await handleRejectBankDetailRequest(
      new Request("http://localhost/api/finance/bank-detail-requests/bank-change-1/reject", {
        method: "POST",
        body: JSON.stringify({ reason: "Account mismatch." }),
      }),
      commands,
      "emp-pramod",
      "bank-change-1",
    );

    expect(response.status).toBe(200);
    expect(commands.rejectBankDetailChange).toHaveBeenCalledWith(
      "emp-pramod",
      "bank-change-1",
      "Account mismatch.",
    );
  });

  it("rejects a rejection without a reason string", async () => {
    const commands = buildCommands();
    const response = await handleRejectBankDetailRequest(
      new Request("http://localhost/api/finance/bank-detail-requests/bank-change-1/reject", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      commands,
      "emp-pramod",
      "bank-change-1",
    );

    expect(response.status).toBe(422);
    expect(commands.rejectBankDetailChange).not.toHaveBeenCalled();
  });

  it("maps a command authorization error to 403", async () => {
    const commands = buildCommands({
      approveBankDetailChange: vi.fn().mockRejectedValue(
        new (await import("./commands")).ExpenseError("unauthorized", "Your role does not have the approve bank detail changes privilege."),
      ),
    });
    const response = await handleApproveBankDetailRequest(
      new Request("http://localhost/api/finance/bank-detail-requests/bank-change-1/approve", {
        method: "POST",
      }),
      commands,
      "emp-ada",
      "bank-change-1",
    );

    expect(response.status).toBe(403);
  });

  it("maps an unknown failure to 500 without leaking details", async () => {
    const commands = buildCommands({
      getProfile: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const response = await handleGetProfileRequest(
      new Request("http://localhost/api/profile"),
      commands,
      "emp-shameel",
    );

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toMatchObject({ error: "internal" });
  });
});
