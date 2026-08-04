import { describe, expect, it } from "vitest";
import { AdminError, type AdminCommands } from "./commands";
import { handleAssignRoleRequest, handleCreateFlowRequest } from "./http";
import type { FlowDraft } from "./ports";

function buildCommands(overrides: Partial<AdminCommands> = {}): AdminCommands {
  return {
    listEmployees: async () => [],
    listFlows: async () => [],
    getAdminActor: async () => null,
    assignRole: async () => {},
    createFlowDraft: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      scope: "All departments",
      status: "draft",
      steps: ["Manager"],
    }),
    ...overrides,
  };
}

async function json(response: Response): Promise<{ error?: string; ok?: boolean }> {
  return (await response.json()) as { error?: string; ok?: boolean };
}

describe("handleAssignRoleRequest", () => {
  it("returns 200 when the assignment succeeds", async () => {
    const response = await handleAssignRoleRequest(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", role: "Manager" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("maps AdminError codes to the right statuses", async () => {
    const cases: Array<[AdminError, number]> = [
      [new AdminError("unauthorized", "no"), 403],
      [new AdminError("not-found", "no"), 404],
      [new AdminError("validation", "no"), 422],
    ];
    for (const [error, status] of cases) {
      const commands = buildCommands({ assignRole: async () => Promise.reject(error) });
      const response = await handleAssignRoleRequest(
        new Request("http://localhost/api/admin/roles", {
          method: "POST",
          body: JSON.stringify({ employeeId: "emp-ada", role: "Manager" }),
        }),
        commands,
        "emp-grace",
      );
      expect(response.status, error.code).toBe(status);
    }
  });

  it("rejects a body without string employeeId or role", async () => {
    const response = await handleAssignRoleRequest(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ employeeId: 42 }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a malformed JSON body with 422, not 500", async () => {
    const response = await handleAssignRoleRequest(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        body: "{not json",
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });

  it("returns 500 for unexpected failures", async () => {
    const commands = buildCommands({
      assignRole: async () => {
        throw new Error("connection refused");
      },
    });
    const response = await handleAssignRoleRequest(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", role: "Manager" }),
      }),
      commands,
      "emp-grace",
    );

    expect(response.status).toBe(500);
  });
});

describe("handleCreateFlowRequest", () => {
  it("returns 201 when the draft is created", async () => {
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Standard reimbursement",
          scope: "All departments",
          steps: ["Manager"],
        }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.ok).toBe(true);
  });

  it("rejects a body without string steps", async () => {
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({ name: "x", scope: "All departments", steps: [1] }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a malformed JSON body with 422, not 500", async () => {
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: "{not json",
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });

  it("maps a store-level validation error (unseeded role) to 422", async () => {
    const commands = buildCommands({
      createFlowDraft: async () =>
        Promise.reject(new AdminError("validation", 'Role "Manager" is not seeded.')),
    });
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Standard reimbursement",
          scope: "All departments",
          steps: ["Manager"],
        }),
      }),
      commands,
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });
});
