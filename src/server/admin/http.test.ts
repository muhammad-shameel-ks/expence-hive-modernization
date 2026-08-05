import { describe, expect, it } from "vitest";
import { AdminError, type AdminCommands } from "./commands";
import {
  handleAssignRoleRequest,
  handleCreateDepartmentRequest,
  handleCreateFlowRequest,
  handleCreateRoleRequest,
  handleDeactivateDepartmentRequest,
  handleDeactivateRoleRequest,
  handlePublishFlowRequest,
} from "./http";
import type { AdminDepartment, AdminRole, FlowDraft } from "./ports";

function buildCommands(overrides: Partial<AdminCommands> = {}): AdminCommands {
  return {
    listEmployees: async () => [],
    listFlows: async () => [],
    getAdminActor: async () => null,
    assignRole: async () => {},
    listDepartments: async () => [],
    createDepartment: async (): Promise<AdminDepartment> => ({
      id: "dept-1",
      organizationId: "org-1",
      name: "Engineering",
      active: true,
    }),
    deactivateDepartment: async () => {},
    listRoles: async () => [],
    createRole: async (): Promise<AdminRole> => ({
      id: "role-1",
      organizationId: "org-1",
      code: "team-lead",
      displayName: "Team Lead",
      departmentId: null,
      active: true,
    }),
    deactivateRole: async () => {},
    createFlow: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      roleId: "role-1",
      status: "draft",
      steps: ["role-2"],
    }),
    publishFlow: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      roleId: "role-1",
      status: "published",
      steps: ["role-2"],
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
        body: JSON.stringify({ employeeId: "emp-ada", roleId: "role-1" }),
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
          body: JSON.stringify({ employeeId: "emp-ada", roleId: "role-1" }),
        }),
        commands,
        "emp-grace",
      );
      expect(response.status, error.code).toBe(status);
    }
  });

  it("rejects a body without string employeeId or roleId", async () => {
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
        body: JSON.stringify({ employeeId: "emp-ada", roleId: "role-1" }),
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
          roleId: "role-1",
          steps: ["role-2"],
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
        body: JSON.stringify({ name: "x", roleId: "role-1", steps: [1] }),
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

  it("maps a store-level validation error (unknown role) to 422", async () => {
    const commands = buildCommands({
      createFlow: async () => Promise.reject(new AdminError("validation", 'Unknown role "role-1".')),
    });
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Standard reimbursement",
          roleId: "role-1",
          steps: ["role-2"],
        }),
      }),
      commands,
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });
});

describe("handlePublishFlowRequest", () => {
  it("returns 200 with the published flow", async () => {
    const response = await handlePublishFlowRequest(
      new Request("http://localhost/api/admin/flows/publish", {
        method: "POST",
        body: JSON.stringify({ flowId: "flow-1" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { flow: FlowDraft };
    expect(body.flow.status).toBe("published");
  });

  it("rejects a body without a string flowId", async () => {
    const response = await handlePublishFlowRequest(
      new Request("http://localhost/api/admin/flows/publish", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleCreateDepartmentRequest", () => {
  it("returns 201 when the department is created", async () => {
    const response = await handleCreateDepartmentRequest(
      new Request("http://localhost/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({ name: "Engineering" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(201);
  });

  it("rejects a body without a string name", async () => {
    const response = await handleCreateDepartmentRequest(
      new Request("http://localhost/api/admin/departments", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleDeactivateDepartmentRequest", () => {
  it("returns 200 when the department is deactivated", async () => {
    const response = await handleDeactivateDepartmentRequest(
      new Request("http://localhost/api/admin/departments/deactivate", {
        method: "POST",
        body: JSON.stringify({ departmentId: "dept-1" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(200);
  });
});

describe("handleCreateRoleRequest", () => {
  it("returns 201 when the role is created", async () => {
    const response = await handleCreateRoleRequest(
      new Request("http://localhost/api/admin/org-roles", {
        method: "POST",
        body: JSON.stringify({ code: "team-lead", displayName: "Team Lead", departmentId: null }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(201);
  });

  it("rejects a body without string code or displayName", async () => {
    const response = await handleCreateRoleRequest(
      new Request("http://localhost/api/admin/org-roles", {
        method: "POST",
        body: JSON.stringify({ code: "team-lead" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleDeactivateRoleRequest", () => {
  it("returns 200 when the role is deactivated", async () => {
    const response = await handleDeactivateRoleRequest(
      new Request("http://localhost/api/admin/org-roles/deactivate", {
        method: "POST",
        body: JSON.stringify({ roleId: "role-1" }),
      }),
      buildCommands(),
      "emp-grace",
    );

    expect(response.status).toBe(200);
  });
});
