// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminDepartment, AdminEmployee, AdminRole } from "@/server/admin/ports";
import { SUPERADMIN_CAPABILITIES } from "@/server/shared/authorization";
import { OrgSection } from "./org-section";

const PEOPLE: AdminEmployee[] = [
  {
    id: "emp-ada",
    organizationId: "org-1",
    name: "Ada Lovelace",
    email: "ada@hive.local",
    department: "Engineering",
    departmentId: "dept-engineering",
    role: null,
    active: true,
    managerId: null,
  },
  {
    id: "emp-grace",
    organizationId: "org-1",
    name: "Grace Hopper",
    email: "grace@hive.local",
    department: "Engineering",
    departmentId: "dept-engineering",
    role: null,
    active: true,
    managerId: null,
  },
];

const HEADED: AdminDepartment = {
  id: "dept-engineering",
  organizationId: "org-1",
  name: "Engineering",
  active: true,
  headId: "emp-ada",
  head: { id: "emp-ada", name: "Ada Lovelace" },
};

const HEADLESS: AdminDepartment = {
  id: "dept-legacy",
  organizationId: "org-1",
  name: "Legacy",
  active: true,
  headId: null,
  head: null,
};

const MANAGER_ROLE: AdminRole = {
  id: "role-manager",
  organizationId: "org-1",
  code: "manager",
  displayName: "Manager",
  departmentId: null,
  active: true,
  locked: true,
  capabilities: {
    canSubmit: true,
    canApprove: true,
    canAccessFinance: false,
    canHold: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
  },
};

const SUPERADMIN_ROLE: AdminRole = {
  id: "role-superadmin",
  organizationId: "org-1",
  code: "superadmin",
  displayName: "Superadmin",
  departmentId: null,
  active: true,
  locked: true,
  capabilities: SUPERADMIN_CAPABILITIES,
};

const PENDING_CLAIM = {
  ref: "EXP-1001",
  title: "Flight ticket",
  requesterId: "emp-ada",
  requesterName: "Ada Lovelace",
  stage: "Manager",
  willSkip: true,
};

function renderOrg(departments: AdminDepartment[], roles: AdminRole[] = []) {
  const onMessage = vi.fn();
  const onError = vi.fn();
  const onDepartmentsChange = vi.fn();
  const onRolesChange = vi.fn();
  render(
    <OrgSection
      departments={departments}
      roles={roles}
      people={PEOPLE}
      onMessage={onMessage}
      onError={onError}
      onDepartmentsChange={onDepartmentsChange}
      onRolesChange={onRolesChange}
    />,
  );
  return { onMessage, onError, onDepartmentsChange, onRolesChange };
}

function capabilitiesResponse(role: AdminRole, pendingClaims: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({ ok: true, role, pendingClaims }),
  };
}

function conflictResponse(impact: unknown) {
  return {
    ok: false,
    status: 409,
    json: async () => ({ error: "conflict", impact }),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OrgSection department heads", () => {
  it("creates a department with its head", async () => {
    const { onMessage, onDepartmentsChange } = renderOrg([]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        department: {
          id: "dept-research",
          organizationId: "org-1",
          name: "Research",
          active: true,
          headId: "emp-grace",
          head: { id: "emp-grace", name: "Grace Hopper" },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Research" } });
    fireEvent.change(screen.getByLabelText("Head"), { target: { value: "emp-grace" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add department" }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/departments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Research", headId: "emp-grace" }),
      }),
    );
    expect(onDepartmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Research", headId: "emp-grace" }),
    ]);
    expect(onMessage).toHaveBeenCalledWith("Research department created, headed by Grace Hopper.");
  });

  it("keeps the Add department button disabled until a head is picked", () => {
    renderOrg([]);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Research" } });

    expect(screen.getByRole("button", { name: "Add department" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Head"), { target: { value: "emp-ada" } });

    expect(screen.getByRole("button", { name: "Add department" })).toBeEnabled();
  });

  it("flags headless departments as incomplete", () => {
    renderOrg([HEADED, HEADLESS]);

    expect(screen.getByText("Head: Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("No head - incomplete")).toBeInTheDocument();
  });

  it("changes the head of a department", async () => {
    const { onMessage, onDepartmentsChange } = renderOrg([HEADED]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Change head of Engineering"), {
        target: { value: "emp-grace" },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/departments/head",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ departmentId: "dept-engineering", headId: "emp-grace" }),
      }),
    );
    expect(onDepartmentsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "dept-engineering",
        headId: "emp-grace",
        head: { id: "emp-grace", name: "Grace Hopper" },
      }),
    ]);
    expect(onMessage).toHaveBeenCalledWith(
      "Grace Hopper is now the head of the Engineering department.",
    );
  });

  it("shows an error when the head change is rejected", async () => {
    const { onError } = renderOrg([HEADED]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "validation" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Change head of Engineering"), {
        target: { value: "emp-grace" },
      });
    });

    expect(onError).toHaveBeenCalledWith("The head could not be saved. Please try again.");
  });
});

describe("OrgSection role creation", () => {
  it("keeps the Add role button disabled until code and display name are filled", () => {
    renderOrg([]);

    expect(screen.getByRole("button", { name: "Add role" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "team-lead" } });

    expect(screen.getByRole("button", { name: "Add role" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Team Lead" } });

    expect(screen.getByRole("button", { name: "Add role" })).toBeEnabled();
  });

  it("creates a custom role with its privilege set", async () => {
    const { onMessage, onRolesChange } = renderOrg([]);
    const createdRole: AdminRole = {
      ...MANAGER_ROLE,
      id: "role-team-lead",
      code: "team-lead",
      displayName: "Team Lead",
      locked: false,
      capabilities: { ...MANAGER_ROLE.capabilities!, canAccessFinance: true },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: createdRole }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "team-lead" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Team Lead" } });
    fireEvent.click(screen.getByRole("switch", { name: "Finance verify and pay for the new role" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/org-roles");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      code: "team-lead",
      displayName: "Team Lead",
      capabilities: {
        canSubmit: true,
        canApprove: false,
        canAccessFinance: true,
        canHold: false,
        canViewOrganizationActivity: false,
        canAccessAdminConsole: false,
      },
    });
    expect(onRolesChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "role-team-lead", displayName: "Team Lead" }),
    ]);
    expect(onMessage).toHaveBeenCalledWith("Team Lead role created.");
    expect(screen.getByLabelText("Code")).toHaveValue("");
    expect(screen.getByLabelText("Display name")).toHaveValue("");
    expect(screen.getByRole("switch", { name: "Finance verify and pay for the new role" })).not.toBeChecked();
  });

  it("shows an error when role creation is rejected", async () => {
    const { onError } = renderOrg([]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "validation" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "team-lead" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Team Lead" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    });

    expect(onError).toHaveBeenCalledWith("The role could not be saved. Please try again.");
  });
});

describe("OrgSection privilege toggles", () => {
  it("saves a granted privilege toggle", async () => {
    const { onMessage, onRolesChange } = renderOrg([], [MANAGER_ROLE]);
    const updated: AdminRole = {
      ...MANAGER_ROLE,
      capabilities: { ...MANAGER_ROLE.capabilities!, canAccessFinance: true },
    };
    const fetchMock = vi.fn().mockResolvedValue(capabilitiesResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Finance verify and pay" }));
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/org-roles/capabilities");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      roleId: "role-manager",
      capabilities: expect.objectContaining({ canAccessFinance: true }),
    });
    expect(JSON.parse(init.body)).not.toHaveProperty("confirmed");
    expect(onRolesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "role-manager",
        capabilities: expect.objectContaining({ canAccessFinance: true }),
      }),
    ]);
    expect(onMessage).toHaveBeenCalledWith("Manager privileges saved.");
  });

  it("saves a removal with no pending claims without a dialog", async () => {
    const { onMessage } = renderOrg([], [MANAGER_ROLE]);
    const updated: AdminRole = {
      ...MANAGER_ROLE,
      capabilities: { ...MANAGER_ROLE.capabilities!, canApprove: false },
    };
    const fetchMock = vi.fn().mockResolvedValue(capabilitiesResponse(updated, []));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Approve and reject" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onMessage).toHaveBeenCalledWith("Manager privileges saved.");
  });

  it("shows an error when the privilege save is rejected", async () => {
    const { onError } = renderOrg([], [MANAGER_ROLE]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Finance verify and pay" }));
    });

    expect(onError).toHaveBeenCalledWith("The role privileges could not be saved. Please try again.");
    expect(screen.getByRole("switch", { name: "Manager Finance verify and pay" })).not.toBeChecked();
  });

  it("opens the warning dialog when removing an action privilege with pending claims", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      conflictResponse({ removedActionPrivileges: ["canApprove"], pendingClaims: [PENDING_CLAIM] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderOrg([], [MANAGER_ROLE]);

    const approveSwitch = screen.getByRole("switch", { name: "Manager Approve and reject" });
    await act(async () => {
      fireEvent.click(approveSwitch);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Remove a role privilege?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Removing approve affects 1 pending claim at this role's steps. Pending steps skip forward on the next absence sweep, except at the terminal stage, which stays pending with no eligible actor.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("EXP-1001")).toBeInTheDocument();
    expect(screen.getByText("Flight ticket")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace · Manager")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // The removal has not been applied: the switch stays on until confirmed.
    expect(approveSwitch).toBeChecked();
  });

  it("cancel closes the dialog without saving the removal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      conflictResponse({ removedActionPrivileges: ["canApprove"], pendingClaims: [PENDING_CLAIM] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderOrg([], [MANAGER_ROLE]);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Approve and reject" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body),
    ).not.toHaveProperty("confirmed");
    expect(screen.getByRole("switch", { name: "Manager Approve and reject" })).toBeChecked();
  });

  it("confirm sends the removal with confirmed and reports the skip-forward", async () => {
    const { onMessage, onRolesChange } = renderOrg([], [MANAGER_ROLE]);
    const updated: AdminRole = {
      ...MANAGER_ROLE,
      capabilities: { ...MANAGER_ROLE.capabilities!, canApprove: false },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        conflictResponse({ removedActionPrivileges: ["canApprove"], pendingClaims: [PENDING_CLAIM] }),
      )
      .mockResolvedValueOnce(capabilitiesResponse(updated, [PENDING_CLAIM]));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Approve and reject" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body),
    ).toEqual({
      roleId: "role-manager",
      capabilities: expect.objectContaining({ canApprove: false }),
      confirmed: true,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onRolesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "role-manager",
        capabilities: expect.objectContaining({ canApprove: false }),
      }),
    ]);
    expect(onMessage).toHaveBeenCalledWith(
      "Manager privileges saved. 1 pending step at this role will skip forward.",
    );
  });

  it("keeps the dialog open when the confirmed removal fails", async () => {
    const { onError } = renderOrg([], [MANAGER_ROLE]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        conflictResponse({ removedActionPrivileges: ["canApprove"], pendingClaims: [PENDING_CLAIM] }),
      )
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "internal" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Approve and reject" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    });

    expect(onError).toHaveBeenCalledWith("The role privileges could not be saved. Please try again.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm removal" })).toBeEnabled();
  });

  it("flags a terminal-stage pending claim as not skipping, and reports it as stranded once confirmed", async () => {
    const terminalClaim = { ...PENDING_CLAIM, willSkip: false };
    const { onMessage } = renderOrg([], [MANAGER_ROLE]);
    const updated: AdminRole = {
      ...MANAGER_ROLE,
      capabilities: { ...MANAGER_ROLE.capabilities!, canApprove: false },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        conflictResponse({ removedActionPrivileges: ["canApprove"], pendingClaims: [terminalClaim] }),
      )
      .mockResolvedValueOnce(capabilitiesResponse(updated, [terminalClaim]));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Manager Approve and reject" }));
    });

    expect(screen.getByText("Will not skip")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    });

    expect(onMessage).toHaveBeenCalledWith(
      "Manager privileges saved. 1 pending claim at this role's terminal stage will remain pending with no eligible actor.",
    );
  });
});

describe("OrgSection superadmin role", () => {
  it("renders superadmin read-only with every privilege on and no switches", () => {
    renderOrg([], [SUPERADMIN_ROLE, MANAGER_ROLE]);

    const superadminPanel = within(screen.getByText("Superadmin").closest("li")!);
    const managerPanel = within(screen.getByText("Manager").closest("li")!);

    expect(superadminPanel.getByText("Built-in console owner")).toBeInTheDocument();
    expect(superadminPanel.getAllByText("On")).toHaveLength(6);
    expect(superadminPanel.queryAllByRole("switch")).toHaveLength(0);
    expect(managerPanel.getAllByRole("switch")).toHaveLength(6);
  });

  it("never exposes delegation or auto-skip configuration as toggles", () => {
    renderOrg([], [SUPERADMIN_ROLE, MANAGER_ROLE]);

    expect(screen.queryByRole("switch", { name: /delegation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /auto-skip/i })).not.toBeInTheDocument();
  });
});
