import { describe, expect, it, vi } from "vitest";
import { AdminError, type AdminCommands } from "./commands";
import {
  handleAssignDepartmentRequest,
  handleAssignManagerRequest,
  handleAssignRoleRequest,
  handleCreateDepartmentRequest,
  handleCreateFlowRequest,
  handleCreateRoleRequest,
  handleDeactivateDepartmentRequest,
  handleDeactivateEmployeeRequest,
  handleDeactivateRoleRequest,
  handleListAuditRequest,
  handlePublishFlowRequest,
  handleReactivateEmployeeRequest,
  handleUpdateFlowRequest,
} from "./http";
import type { AdminDepartment, AdminRole, FlowDraft } from "./ports";

function buildCommands(overrides: Partial<AdminCommands> = {}): AdminCommands {
  return {
    listEmployees: async () => [],
    listFlows: async () => [],
    getAdminActor: async () => null,
    assignRole: async () => {},
    assignDepartment: async () => {},
    deactivateEmployee: async () => {},
    reactivateEmployee: async () => {},
    assignManager: async () => {},
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
      locked: false,
    }),
    deactivateRole: async () => {},
    createFlow: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      roleId: "role-1",
      status: "draft",
      steps: [{ kind: "role", roleId: "role-2" }],
    }),
    publishFlow: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      roleId: "role-1",
      status: "published",
      steps: [{ kind: "role", roleId: "role-2" }],
    }),
    updateFlow: async (): Promise<FlowDraft> => ({
      id: "flow-1",
      name: "Standard reimbursement",
      roleId: "role-1",
      status: "draft",
      steps: [{ kind: "role", roleId: "role-2" }],
    }),
    deleteFlow: async () => {},
    listAuditEvents: async () => ({ events: [], total: 0 }),
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
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("maps AdminError codes to the right statuses", async () => {
    const cases: Array<[AdminError, number]> = [
      [new AdminError("unauthorized", "no"), 403],
      [new AdminError("not-found", "no"), 404],
      [new AdminError("validation", "no"), 422],
      [new AdminError("locked", "no"), 422],
    ];
    for (const [error, status] of cases) {
      const commands = buildCommands({ assignRole: async () => Promise.reject(error) });
      const response = await handleAssignRoleRequest(
        new Request("http://localhost/api/admin/roles", {
          method: "POST",
          body: JSON.stringify({ employeeId: "emp-ada", roleId: "role-1" }),
        }),
        commands,
        "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
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
          steps: [{ kind: "role", roleId: "role-2" }],
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    const body = await json(response);
    expect(body.ok).toBe(true);
  });

  it("accepts a team-lead step in the step list", async () => {
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Intern reimbursement",
          roleId: "role-1",
          steps: [{ kind: "team-lead" }, { kind: "role", roleId: "role-2" }],
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
  });

  it("rejects a body with malformed steps", async () => {
    // A team-lead step carrying a stray roleId is deliberately accepted at
    // the boundary (the field is ignored) and rejected by the command
    // layer; the other shapes are malformed and rejected here.
    const cases = [{ kind: "role" }, { kind: "ceo" }, 1, "role-2"];
    for (const steps of cases) {
      const response = await handleCreateFlowRequest(
        new Request("http://localhost/api/admin/flows", {
          method: "POST",
          body: JSON.stringify({ name: "x", roleId: "role-1", steps: [steps] }),
        }),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, JSON.stringify(steps)).toBe(422);
    }
  });

  it("rejects a body without steps", async () => {
    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({ name: "x", roleId: "role-1" }),
      }),
      buildCommands(),
      "emp-superadmin",
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
      "emp-superadmin",
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
          steps: [{ kind: "role", roleId: "role-2" }],
        }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleUpdateFlowRequest", () => {
  it("returns 200 when the flow is updated with mixed step kinds", async () => {
    const response = await handleUpdateFlowRequest(
      new Request("http://localhost/api/admin/flows/update", {
        method: "POST",
        body: JSON.stringify({
          flowId: "flow-1",
          name: "Intern reimbursement",
          roleId: "role-1",
          steps: [{ kind: "team-lead" }, { kind: "role", roleId: "role-2" }],
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });

  it("rejects a body with malformed steps", async () => {
    const response = await handleUpdateFlowRequest(
      new Request("http://localhost/api/admin/flows/update", {
        method: "POST",
        body: JSON.stringify({
          flowId: "flow-1",
          name: "x",
          roleId: "role-1",
          steps: [{ kind: "ceo" }],
        }),
      }),
      buildCommands(),
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });
});

describe("handleCreateRoleRequest", () => {
  it("returns 201 when the role is created", async () => {
    const response = await handleCreateRoleRequest(
      new Request("http://localhost/api/admin/org-roles", {
        method: "POST",
        body: JSON.stringify({ code: "team-lead", displayName: "Team Lead" }),
      }),
      buildCommands(),
      "emp-superadmin",
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
      "emp-superadmin",
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
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });
});

describe("handleDeactivateEmployeeRequest", () => {
  it("returns 200 when the employee is deactivated", async () => {
    const response = await handleDeactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/deactivate", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      deactivateEmployee: async () =>
        Promise.reject(new AdminError("unauthorized", "Only Superadmin can use the admin workspace.")),
    });
    const response = await handleDeactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/deactivate", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada" }),
      }),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });

  it("maps conflict guards to 409", async () => {
    const cases = [
      new AdminError("conflict", "You cannot deactivate your own account."),
      new AdminError("conflict", "The last active Superadmin cannot be deactivated."),
    ];
    for (const error of cases) {
      const commands = buildCommands({
        deactivateEmployee: async () => Promise.reject(error),
      });
      const response = await handleDeactivateEmployeeRequest(
        new Request("http://localhost/api/admin/employees/deactivate", {
          method: "POST",
          body: JSON.stringify({ employeeId: "emp-superadmin" }),
        }),
        commands,
        "emp-superadmin",
      );

      expect(response.status).toBe(409);
      await expect(json(response)).resolves.toEqual({ error: "conflict" });
    }
  });

  it("rejects a body without a string employeeId", async () => {
    const response = await handleDeactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/deactivate", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a malformed JSON body with 422, not 500", async () => {
    const response = await handleDeactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/deactivate", {
        method: "POST",
        body: "{not json",
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleReactivateEmployeeRequest", () => {
  it("returns 200 when the employee is reactivated", async () => {
    const response = await handleReactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/reactivate", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      reactivateEmployee: async () =>
        Promise.reject(new AdminError("unauthorized", "Only Superadmin can use the admin workspace.")),
    });
    const response = await handleReactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/reactivate", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada" }),
      }),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });

  it("rejects a body without a string employeeId", async () => {
    const response = await handleReactivateEmployeeRequest(
      new Request("http://localhost/api/admin/employees/reactivate", {
        method: "POST",
        body: JSON.stringify({ employeeId: 42 }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleAssignManagerRequest", () => {
  it("returns 200 when the manager is assigned", async () => {
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", managerId: "emp-grace" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("accepts a null managerId to clear the assignment", async () => {
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", managerId: null }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });

  it("accepts an omitted managerId as a clear", async () => {
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      assignManager: async () =>
        Promise.reject(new AdminError("unauthorized", "Only Superadmin can use the admin workspace.")),
    });
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", managerId: "emp-grace" }),
      }),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });

  it("maps a validation error to 422", async () => {
    const commands = buildCommands({
      assignManager: async () =>
        Promise.reject(new AdminError("validation", "An employee cannot be their own manager.")),
    });
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", managerId: "emp-ada" }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a body with a non-string employeeId", async () => {
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: 42, managerId: "emp-grace" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });

  it("rejects a body with a non-string, non-null managerId", async () => {
    const response = await handleAssignManagerRequest(
      new Request("http://localhost/api/admin/employees/manager", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", managerId: 42 }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleAssignDepartmentRequest", () => {
  it("returns 200 when the department is assigned", async () => {
    const response = await handleAssignDepartmentRequest(
      new Request("http://localhost/api/admin/employee-department", {
        method: "POST",
        body: JSON.stringify({ employeeId: "emp-ada", departmentId: "dept-1" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
  });
});

describe("handleListAuditRequest", () => {
  it("returns 200 with events, total, page, and pageSize", async () => {
    const commands = buildCommands({
      listAuditEvents: async () => ({
        events: [
          {
            id: "audit-1",
            organizationId: "org-1",
            actorId: "emp-superadmin",
            action: "assign-role",
            detail: "Katherine Johnson assigned to the Manager role.",
            createdAt: new Date("2026-08-01T10:00:00.000Z"),
          },
        ],
        total: 1,
      }),
    });
    const response = await handleListAuditRequest(
      new Request("http://localhost/api/admin/audit?page=2&pageSize=25"),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      events: Array<{ id: string; createdAt: string }>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(body).toMatchObject({ total: 1, page: 2, pageSize: 25 });
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      id: "audit-1",
      actorId: "emp-superadmin",
      action: "assign-role",
      createdAt: "2026-08-01T10:00:00.000Z",
    });
  });

  it("passes the parsed filters and pagination to the command", async () => {
    const listAuditEvents = vi.fn().mockResolvedValue({ events: [], total: 0 });
    const commands = buildCommands({ listAuditEvents });
    const response = await handleListAuditRequest(
      new Request(
        "http://localhost/api/admin/audit?actorId=emp-1&action=assign-role&from=2026-08-01&to=2026-08-10&page=2&pageSize=25",
      ),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    expect(listAuditEvents).toHaveBeenCalledWith(
      "emp-superadmin",
      { actorId: "emp-1", action: "assign-role", from: "2026-08-01", to: "2026-08-10" },
      { page: 2, pageSize: 25 },
    );
  });

  it("defaults page and pageSize when omitted", async () => {
    const listAuditEvents = vi.fn().mockResolvedValue({ events: [], total: 0 });
    const commands = buildCommands({ listAuditEvents });

    const response = await handleListAuditRequest(
      new Request("http://localhost/api/admin/audit"),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    expect(listAuditEvents).toHaveBeenCalledWith("emp-superadmin", {}, { page: 1, pageSize: 50 });
  });

  it("maps a non-superadmin actor to 403", async () => {
    const commands = buildCommands({
      listAuditEvents: async () =>
        Promise.reject(
          new AdminError("unauthorized", "Only Superadmin can use the admin workspace."),
        ),
    });
    const response = await handleListAuditRequest(
      new Request("http://localhost/api/admin/audit"),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("rejects a non-date from or to with 422", async () => {
    const badValues = ["08-01-2026", "2026-08-1", "2026-13-99", "2026-02-30", "not-a-date"];
    for (const value of badValues) {
      const response = await handleListAuditRequest(
        new Request(`http://localhost/api/admin/audit?from=${value}`),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, `from=${value}`).toBe(422);

      const toResponse = await handleListAuditRequest(
        new Request(`http://localhost/api/admin/audit?to=${value}`),
        buildCommands(),
        "emp-superadmin",
      );
      expect(toResponse.status, `to=${value}`).toBe(422);
    }
  });

  it("rejects malformed page or pageSize with 422", async () => {
    const badQueries = ["page=0", "page=abc", "pageSize=0", "pageSize=101", "pageSize=-1"];
    for (const query of badQueries) {
      const response = await handleListAuditRequest(
        new Request(`http://localhost/api/admin/audit?${query}`),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, query).toBe(422);
    }
  });

  it("returns 500 for unexpected failures", async () => {
    const commands = buildCommands({
      listAuditEvents: async () => {
        throw new Error("connection refused");
      },
    });
    const response = await handleListAuditRequest(
      new Request("http://localhost/api/admin/audit"),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(500);
  });
});
