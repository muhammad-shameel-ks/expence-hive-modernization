import { describe, expect, it, vi } from "vitest";
import { AdminError, type AdminCommands } from "./commands";
import {
  handleAssignDepartmentRequest,
  handleAssignManagerRequest,
  handleAssignRoleRequest,
  handleBulkImportEmployeesRequest,
  handleCreateDepartmentRequest,
  handleCreateEmployeeRequest,
  handleCreateFlowRequest,
  handleCreateRoleRequest,
  handleDeactivateDepartmentRequest,
  handleDeactivateEmployeeRequest,
  handleDeactivateRoleRequest,
  handleGetAbsenceTimeoutRequest,
  handleListAuditRequest,
  handlePublishFlowRequest,
  handleReactivateEmployeeRequest,
  handleSetAbsenceTimeoutRequest,
  handleSetDepartmentHeadRequest,
  handleUpdateRoleCapabilitiesRequest,
  handleUpdateFlowRequest,
} from "./http";
import type { AdminDepartment, AdminEmployee, AdminRole, FlowDraft, FlowInput } from "./ports";

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
    createEmployee: async (): Promise<AdminEmployee> => ({
      id: "emp-1",
      organizationId: "org-1",
      name: "Ada Lovelace",
      email: "ada@hive.local",
      department: "Engineering",
      departmentId: "dept-1",
      role: { id: "role-1", code: "executive", displayName: "Executive" },
      active: true,
      managerId: "emp-2",
    }),
    importEmployees: async () => ({ total: 0, created: [], failed: [] }),
    listDepartments: async () => [],
    createDepartment: async (): Promise<AdminDepartment> => ({
      id: "dept-1",
      organizationId: "org-1",
      name: "Engineering",
      active: true,
      headId: "emp-2",
      head: { id: "emp-2", name: "Ada Lovelace" },
    }),
    setDepartmentHead: async () => {},
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
    updateRoleCapabilities: async () => ({
      role: {
        id: "role-1",
        organizationId: "org-1",
        code: "team-lead",
        displayName: "Team Lead",
        departmentId: null,
        active: true,
        locked: false,
      },
      pendingClaims: [],
    }),
    getAbsenceTimeoutDays: async () => 3,
    setAbsenceTimeoutDays: async () => {},
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

  it("passes an amount guard through to the command layer", async () => {
    let received: FlowDraft["steps"] | null = null;
    const commands = buildCommands({
      createFlow: async (_organizationId: string, input: FlowInput) => {
        received = input.steps;
        return {
          id: "flow-1",
          status: "draft",
          name: input.name,
          roleId: input.roleId,
          steps: input.steps,
        };
      },
    });

    const response = await handleCreateFlowRequest(
      new Request("http://localhost/api/admin/flows", {
        method: "POST",
        body: JSON.stringify({
          name: "Guarded reimbursement",
          roleId: "role-1",
          steps: [
            { kind: "role", roleId: "role-2", guard: { operator: "gte", amountMinor: 500000 } },
            { kind: "team-lead" },
          ],
        }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    expect(received).toEqual([
      { kind: "role", roleId: "role-2", guard: { operator: "gte", amountMinor: 500000 } },
      { kind: "team-lead", guard: null },
    ]);
  });

  it("rejects a body with a malformed guard", async () => {
    const cases = [
      { operator: "eq", amountMinor: 500000 },
      { operator: "gte", amountMinor: 50.5 },
      { operator: "gte", amountMinor: "500000" },
      { operator: "gte" },
      {},
    ];
    for (const guard of cases) {
      const response = await handleCreateFlowRequest(
        new Request("http://localhost/api/admin/flows", {
          method: "POST",
          body: JSON.stringify({
            name: "x",
            roleId: "role-1",
            steps: [{ kind: "role", roleId: "role-2", guard }],
          }),
        }),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, JSON.stringify(guard)).toBe(422);
    }
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
        body: JSON.stringify({ name: "Engineering", headId: "emp-2" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
  });

  it("rejects a body without a string name or headId", async () => {
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

  it("passes a capability set through to role creation", async () => {
    const createRole = vi.fn().mockResolvedValue({
      id: "role-1",
      organizationId: "org-1",
      code: "reviewer",
      displayName: "Reviewer",
      departmentId: null,
      active: true,
      locked: false,
      capabilities: {
        canSubmit: true,
        canApprove: true,
        canAccessFinance: false,
        canHold: false,
        canViewOrganizationActivity: false,
        canAccessAdminConsole: false,
      },
    });
    const response = await handleCreateRoleRequest(
      new Request("http://localhost/api/admin/org-roles", {
        method: "POST",
        body: JSON.stringify({
          code: "reviewer",
          displayName: "Reviewer",
          capabilities: {
            canSubmit: true,
            canApprove: true,
            canAccessFinance: false,
            canHold: false,
            canViewOrganizationActivity: false,
            canAccessAdminConsole: false,
          },
        }),
      }),
      buildCommands({ createRole }),
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    expect(createRole).toHaveBeenCalledWith("emp-superadmin", {
      code: "reviewer",
      displayName: "Reviewer",
      capabilities: {
        canSubmit: true,
        canApprove: true,
        canAccessFinance: false,
        canHold: false,
        canViewOrganizationActivity: false,
        canAccessAdminConsole: false,
      },
    });
  });

  it("rejects a malformed capability set", async () => {
    const response = await handleCreateRoleRequest(
      new Request("http://localhost/api/admin/org-roles", {
        method: "POST",
        body: JSON.stringify({
          code: "reviewer",
          displayName: "Reviewer",
          capabilities: { canSubmit: true },
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});

describe("handleUpdateRoleCapabilitiesRequest", () => {
  const CAPABILITIES_WITHOUT_APPROVE = {
    canSubmit: true,
    canApprove: false,
    canAccessFinance: false,
    canHold: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
  };

  it("returns 200 with the updated role and the claims that will skip", async () => {
    const updateRoleCapabilities = vi.fn().mockResolvedValue({
      role: {
        id: "role-1",
        organizationId: "org-1",
        code: "reviewer",
        displayName: "Reviewer",
        departmentId: null,
        active: true,
        locked: false,
        capabilities: CAPABILITIES_WITHOUT_APPROVE,
      },
      pendingClaims: [{ ref: "EXP-2026-0001", title: "Reviewer claim", requesterId: "emp-1", requesterName: "Ada", stage: "Reviewer" }],
    });
    const response = await handleUpdateRoleCapabilitiesRequest(
      new Request("http://localhost/api/admin/org-roles/capabilities", {
        method: "POST",
        body: JSON.stringify({
          roleId: "role-1",
          capabilities: CAPABILITIES_WITHOUT_APPROVE,
          confirmed: true,
        }),
      }),
      buildCommands({ updateRoleCapabilities }),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      pendingClaims: [{ title: "Reviewer claim" }],
    });
    expect(updateRoleCapabilities).toHaveBeenCalledWith("emp-superadmin", "role-1", CAPABILITIES_WITHOUT_APPROVE, {
      confirmed: true,
    });
  });

  it("serializes the unconfirmed-removal conflict with its impact", async () => {
    const impact = {
      removedActionPrivileges: ["canApprove"],
      pendingClaims: [{ ref: "EXP-2026-0001", title: "Reviewer claim", requesterId: "emp-1", requesterName: "Ada", stage: "Reviewer" }],
    };
    const updateRoleCapabilities = vi.fn().mockRejectedValue(
      new AdminError("conflict", "Removing approve affects 1 pending claim.", impact),
    );
    const response = await handleUpdateRoleCapabilitiesRequest(
      new Request("http://localhost/api/admin/org-roles/capabilities", {
        method: "POST",
        body: JSON.stringify({ roleId: "role-1", capabilities: CAPABILITIES_WITHOUT_APPROVE }),
      }),
      buildCommands({ updateRoleCapabilities }),
      "emp-superadmin",
    );

    expect(response.status).toBe(409);
    await expect(json(response)).resolves.toEqual({
      error: "conflict",
      impact,
    });
  });

  it("rejects a malformed body", async () => {
    for (const body of [
      { capabilities: CAPABILITIES_WITHOUT_APPROVE },
      { roleId: "role-1" },
      { roleId: "role-1", capabilities: { canSubmit: true } },
      { roleId: "role-1", capabilities: CAPABILITIES_WITHOUT_APPROVE, confirmed: "yes" },
    ]) {
      const response = await handleUpdateRoleCapabilitiesRequest(
        new Request("http://localhost/api/admin/org-roles/capabilities", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        buildCommands(),
        "emp-superadmin",
      );

      expect(response.status).toBe(422);
    }
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

describe("handleCreateEmployeeRequest", () => {
  it("returns 201 with the created employee", async () => {
    const response = await handleCreateEmployeeRequest(
      new Request("http://localhost/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          name: "Grace Hopper",
          email: "grace@hive.local",
          roleId: "role-1",
          departmentId: "dept-1",
          managerId: "emp-2",
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: boolean; employee: { name: string } };
    expect(body.ok).toBe(true);
    expect(body.employee.name).toBe("Ada Lovelace");
  });

  it("accepts an omitted managerId as the department-head default", async () => {
    const createEmployee = vi.fn().mockResolvedValue({
      id: "emp-1",
      organizationId: "org-1",
      name: "Ada Lovelace",
      email: "ada@hive.local",
      department: "Engineering",
      departmentId: "dept-1",
      role: null,
      active: true,
      managerId: null,
    });
    const commands = buildCommands({ createEmployee });
    const response = await handleCreateEmployeeRequest(
      new Request("http://localhost/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada Lovelace",
          email: "ada@hive.local",
          roleId: "role-1",
          departmentId: "dept-1",
        }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    expect(createEmployee).toHaveBeenCalledWith(
      "emp-superadmin",
      expect.objectContaining({ managerId: null }),
    );
  });

  it("rejects a body missing name, email, roleId or departmentId", async () => {
    const cases = [
      { email: "a@hive.local", roleId: "r", departmentId: "d" },
      { name: "Ada", roleId: "r", departmentId: "d" },
      { name: "Ada", email: "a@hive.local", departmentId: "d" },
      { name: "Ada", email: "a@hive.local", roleId: "r" },
      {},
    ];
    for (const body of cases) {
      const response = await handleCreateEmployeeRequest(
        new Request("http://localhost/api/admin/employees", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("rejects a non-string managerId", async () => {
    const response = await handleCreateEmployeeRequest(
      new Request("http://localhost/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada",
          email: "a@hive.local",
          roleId: "role-1",
          departmentId: "dept-1",
          managerId: 42,
        }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      createEmployee: async () =>
        Promise.reject(new AdminError("unauthorized", "Only Superadmin can use the admin workspace.")),
    });
    const response = await handleCreateEmployeeRequest(
      new Request("http://localhost/api/admin/employees", {
        method: "POST",
        body: JSON.stringify({
          name: "Ada",
          email: "a@hive.local",
          roleId: "role-1",
          departmentId: "dept-1",
        }),
      }),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });
});

describe("handleSetDepartmentHeadRequest", () => {
  it("returns 200 when the head changes", async () => {
    const response = await handleSetDepartmentHeadRequest(
      new Request("http://localhost/api/admin/departments/head", {
        method: "POST",
        body: JSON.stringify({ departmentId: "dept-1", headId: "emp-2" }),
      }),
      buildCommands(),
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true });
  });

  it("rejects a body without string departmentId or headId", async () => {
    const cases = [{}, { departmentId: "dept-1" }, { headId: "emp-2" }, { departmentId: 1, headId: "emp-2" }];
    for (const body of cases) {
      const response = await handleSetDepartmentHeadRequest(
        new Request("http://localhost/api/admin/departments/head", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });
});

describe("handleBulkImportEmployeesRequest", () => {
  const CSV = "name,email,role,department,manager\nGrace Hopper,grace@hive.local,executive,Engineering,\n";

  it("returns 201 with per-row results when the import succeeds", async () => {
    const importEmployees = vi.fn().mockResolvedValue({
      total: 1,
      created: [
        {
          rowNumber: 2,
          email: "grace@hive.local",
          status: "created",
          employee: {
            id: "emp-1",
            organizationId: "org-1",
            name: "Grace Hopper",
            email: "grace@hive.local",
            department: "Engineering",
            departmentId: "dept-1",
            role: null,
            active: true,
            managerId: "emp-2",
          },
        },
      ],
      failed: [],
    });
    const commands = buildCommands({ importEmployees });
    const response = await handleBulkImportEmployeesRequest(
      new Request("http://localhost/api/admin/employees/import", {
        method: "POST",
        body: JSON.stringify({ csv: CSV }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { ok: boolean; result: { total: number } };
    expect(body.ok).toBe(true);
    expect(body.result.total).toBe(1);
    expect(importEmployees).toHaveBeenCalledWith("emp-superadmin", { csv: CSV });
  });

  it("returns 422 with the per-row failures when any row fails", async () => {
    const commands = buildCommands({
      importEmployees: async () => ({
        total: 2,
        created: [],
        failed: [
          {
            rowNumber: 3,
            email: "bad@hive.local",
            status: "failed",
            error: 'Unknown role "no-such-role"',
          },
        ],
      }),
    });
    const response = await handleBulkImportEmployeesRequest(
      new Request("http://localhost/api/admin/employees/import", {
        method: "POST",
        body: JSON.stringify({ csv: CSV }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; result: { failed: Array<{ error: string }> } };
    expect(body.error).toBe("validation");
    expect(body.result.failed[0]?.error).toContain('Unknown role "no-such-role"');
  });

  it("rejects a body without a csv string", async () => {
    const cases = [{}, { csv: 42 }, { csv: null }];
    for (const body of cases) {
      const response = await handleBulkImportEmployeesRequest(
        new Request("http://localhost/api/admin/employees/import", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        buildCommands(),
        "emp-superadmin",
      );
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      importEmployees: async () =>
        Promise.reject(new AdminError("unauthorized", "Only Superadmin can use the admin workspace.")),
    });
    const response = await handleBulkImportEmployeesRequest(
      new Request("http://localhost/api/admin/employees/import", {
        method: "POST",
        body: JSON.stringify({ csv: CSV }),
      }),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });
});

describe("handleGetAbsenceTimeoutRequest", () => {
  it("returns the configured timeout", async () => {
    const commands = buildCommands({ getAbsenceTimeoutDays: async () => 7 });

    const response = await handleGetAbsenceTimeoutRequest(
      new Request("http://localhost/api/admin/org-settings"),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ absenceTimeoutDays: 7 });
  });

  it("maps an unauthorized actor to 403", async () => {
    const commands = buildCommands({
      getAbsenceTimeoutDays: async () => Promise.reject(new AdminError("unauthorized", "no")),
    });

    const response = await handleGetAbsenceTimeoutRequest(
      new Request("http://localhost/api/admin/org-settings"),
      commands,
      "emp-katherine",
    );

    expect(response.status).toBe(403);
  });
});

describe("handleSetAbsenceTimeoutRequest", () => {
  it("saves a valid timeout and returns it", async () => {
    const commands = buildCommands();
    const setAbsenceTimeoutDays = vi.spyOn(commands, "setAbsenceTimeoutDays").mockResolvedValue();

    const response = await handleSetAbsenceTimeoutRequest(
      new Request("http://localhost/api/admin/org-settings", {
        method: "POST",
        body: JSON.stringify({ absenceTimeoutDays: 10 }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({ ok: true, absenceTimeoutDays: 10 });
    expect(setAbsenceTimeoutDays).toHaveBeenCalledWith("emp-superadmin", 10);
  });

  it("rejects a body without an integer absenceTimeoutDays", async () => {
    const commands = buildCommands();
    const setAbsenceTimeoutDays = vi.spyOn(commands, "setAbsenceTimeoutDays").mockResolvedValue();

    for (const payload of [
      {},
      { absenceTimeoutDays: "7" },
      { absenceTimeoutDays: 1.5 },
      { absenceTimeoutDays: null },
    ]) {
      const response = await handleSetAbsenceTimeoutRequest(
        new Request("http://localhost/api/admin/org-settings", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        commands,
        "emp-superadmin",
      );
      expect(response.status).toBe(422);
    }
    expect(setAbsenceTimeoutDays).not.toHaveBeenCalled();
  });

  it("maps a validation rejection from the command layer to 422", async () => {
    const commands = buildCommands({
      setAbsenceTimeoutDays: async () => Promise.reject(new AdminError("validation", "no")),
    });

    const response = await handleSetAbsenceTimeoutRequest(
      new Request("http://localhost/api/admin/org-settings", {
        method: "POST",
        body: JSON.stringify({ absenceTimeoutDays: 91 }),
      }),
      commands,
      "emp-superadmin",
    );

    expect(response.status).toBe(422);
  });
});
