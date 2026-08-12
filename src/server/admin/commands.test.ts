import { describe, expect, it } from "vitest";
import { AdminError, createAdminCommands } from "./commands";
import { InMemoryAdminStore } from "./in-memory";
import { InMemoryExpenseStore } from "../expenses/in-memory";
import type { ExpenseClaim } from "../expenses/ports";
import type { RoleCapabilities } from "../shared/authorization";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AuditEvent,
  FlowStepInput,
} from "./ports";

const SUPERADMIN_ROLE = { id: "role-superadmin", code: "superadmin", displayName: "Superadmin" };

const roleStep = (roleId: string) => ({ kind: "role" as const, roleId });
const teamLeadStep = { kind: "team-lead" as const };

// A locked predefined role seeded directly into the store, mirroring what
// the migration and seeds produce for the locked catalog.
const LOCKED_MANAGER_ROLE = {
  id: "role-manager",
  organizationId: "org-1",
  code: "manager",
  displayName: "Manager",
  departmentId: null,
  active: true,
  locked: true,
};

const employees: AdminEmployee[] = [
  {
    id: "emp-superadmin",
    organizationId: "org-1",
    name: "Super Admin",
    email: "superadmin@hive.local",
    department: "Operations",
    role: SUPERADMIN_ROLE,
    active: true,
    managerId: null,
  },
  {
    id: "emp-shameel",
    organizationId: "org-1",
    name: "Muhammad Shameel",
    email: "muhammadshameelks@hive.local",
    department: "Engineering",
    role: SUPERADMIN_ROLE,
    active: true,
    managerId: null,
  },
  {
    id: "emp-katherine",
    organizationId: "org-1",
    name: "Katherine Johnson",
    email: "katherine@hive.local",
    department: "Engineering",
    role: null,
    active: true,
    managerId: null,
  },
  {
    id: "emp-other-org",
    organizationId: "org-2",
    name: "Other Org Person",
    email: "other@other.local",
    department: "Operations",
    role: { id: "role-executive", code: "executive", displayName: "Executive" },
    active: true,
    managerId: null,
  },
];

function buildAdmin(roles: AdminRole[] = [], claims: ExpenseClaim[] = []) {
  const store = new InMemoryAdminStore(employees.map((employee) => ({ ...employee })), roles);
  const expensesStore = new InMemoryExpenseStore({ employees: [] });
  for (const claim of claims) {
    void expensesStore.createClaim(claim);
  }
  const admin = createAdminCommands({ store, expensesStore });
  return { admin, store, expensesStore };
}

describe("getAdminActor", () => {
  it("denies an actor holding a non-superadmin role", async () => {
    const { admin } = buildAdmin();

    await expect(admin.getAdminActor("emp-other-org")).resolves.toBeNull();
  });

  it("returns the actor for a Superadmin", async () => {
    const { admin } = buildAdmin();

    const actor = await admin.getAdminActor("emp-shameel");

    expect(actor).toMatchObject({ id: "emp-shameel", role: { code: "superadmin" } });
  });

  it("returns null for an employee without an admin role", async () => {
    const { admin } = buildAdmin();

    await expect(admin.getAdminActor("emp-katherine")).resolves.toBeNull();
  });

  it("returns null for an unknown employee", async () => {
    const { admin } = buildAdmin();

    await expect(admin.getAdminActor("emp-missing")).resolves.toBeNull();
  });
});

describe("assignRole", () => {
  it("lets an administrator assign a role to an employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: { displayName: "Manager" },
    });
  });

  it("lets a Superadmin assign a role to an employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "finance-executive",
      displayName: "Finance Executive",
    });

    await admin.assignRole("emp-shameel", { employeeId: "emp-katherine", roleId: role.id });

    const people = await admin.listEmployees("emp-shameel");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: { displayName: "Finance Executive" },
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await expect(
      admin.assignRole("emp-katherine", { employeeId: "emp-superadmin", roleId: role.id }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects an unknown target employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await expect(
      admin.assignRole("emp-superadmin", { employeeId: "emp-missing", roleId: role.id }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects assigning a role to an employee outside the actor's organization", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await expect(
      admin.assignRole("emp-superadmin", { employeeId: "emp-other-org", roleId: role.id }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an unknown role id", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: "role-missing" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects assigning an inactive role", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });
    await store.deactivateRole(role.id);

    await expect(
      admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("names AdminError for readable stack traces", async () => {
    const { admin } = buildAdmin();

    const error = await admin
      .assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: "role-missing" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).name).toBe("AdminError");
  });

  it("records an audit event for a role assignment", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });

    const events: AuditEvent[] = store.audit;
    expect(events).toHaveLength(1);
    const assignEvent = events.find((event) => event.action === "assign-role");
    expect(assignEvent).toMatchObject({ actorId: "emp-superadmin", action: "assign-role" });
    expect(assignEvent?.detail).toContain("Katherine Johnson");
    expect(assignEvent?.detail).toContain("Manager");
  });

  it("does not duplicate the assignment or audit event when the role is unchanged", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager"
    });

    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });
    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });

    expect(store.audit.filter((event) => event.action === "assign-role")).toHaveLength(1);
  });
});

describe("assignDepartment", () => {
  it("lets an admin assign a department to an employee", async () => {
    const { admin } = buildAdmin();
    const dept = await admin.createDepartment("emp-superadmin", { name: "Operations", headId: "emp-superadmin" });

    await admin.assignDepartment("emp-superadmin", { employeeId: "emp-katherine", departmentId: dept.id });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      department: "Operations",
    });
  });

  it("updates departmentId even when employee.department string matches department.name", async () => {
    const { admin, store } = buildAdmin();
    const deptIt = await admin.createDepartment("emp-superadmin", { name: "IT", headId: "emp-superadmin" });
    const deptEng = await admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" });

    await store.setEmployeeDepartment("emp-katherine", deptIt.id);
    const employee = await store.getEmployee("emp-katherine");
    if (employee) {
      employee.department = "Engineering";
    }

    await admin.assignDepartment("emp-superadmin", { employeeId: "emp-katherine", departmentId: deptEng.id });

    const updated = await store.getEmployee("emp-katherine");
    expect(updated?.departmentId).toBe(deptEng.id);
  });

  it("automatically assigns a manager as department head when assigned to a headless department", async () => {
    const { admin, store } = buildAdmin([LOCKED_MANAGER_ROLE]);
    const dept = await admin.createDepartment("emp-superadmin", { name: "Executive", headId: "emp-superadmin" });
    await store.setDepartmentHead(dept.id, "");

    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: "role-manager" });
    await admin.assignDepartment("emp-superadmin", { employeeId: "emp-katherine", departmentId: dept.id });

    const departments = await admin.listDepartments("emp-superadmin");
    const executive = departments.find((d) => d.id === dept.id);
    expect(executive?.headId).toBe("emp-katherine");
  });

  it("does not auto-assign a department head for a role that merely mentions 'manager'", async () => {
    const { admin, store } = buildAdmin();
    const caseManagerRole = await admin.createRole("emp-superadmin", {
      code: "case-manager",
      displayName: "Case Manager",
    });
    const dept = await admin.createDepartment("emp-superadmin", { name: "Support", headId: "emp-superadmin" });
    await store.setDepartmentHead(dept.id, "");
    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: caseManagerRole.id });

    await admin.assignDepartment("emp-superadmin", { employeeId: "emp-katherine", departmentId: dept.id });

    const departments = await admin.listDepartments("emp-superadmin");
    const support = departments.find((d) => d.id === dept.id);
    expect(support?.headId).toBeFalsy();
  });
});

describe("departments", () => {
  it("lets an admin create a department", async () => {
    const { admin } = buildAdmin();

    const department = await admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" });

    expect(department).toMatchObject({ name: "Engineering", active: true });
    await expect(admin.listDepartments("emp-superadmin")).resolves.toMatchObject([
      { name: "Engineering" },
    ]);
  });

  it("rejects a department without a name", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createDepartment("emp-superadmin", { name: "  ", headId: "emp-superadmin" }),
    ).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a duplicate department name in the same organization", async () => {
    const { admin } = buildAdmin();
    await admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" });

    await expect(admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createDepartment("emp-katherine", { name: "Engineering", headId: "emp-superadmin" }),
    ).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("lets an admin deactivate a department", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" });

    await admin.deactivateDepartment("emp-superadmin", department.id);

    const departments = await admin.listDepartments("emp-superadmin");
    expect(departments.find((candidate) => candidate.id === department.id)).toMatchObject({
      active: false,
    });
  });

  it("rejects deactivating an unknown department", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateDepartment("emp-superadmin", "dept-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("roles", () => {
  it("lets an admin create an org-wide custom role that is not locked", async () => {
    const { admin } = buildAdmin();

    const role = await admin.createRole("emp-superadmin", {
      code: "team-lead",
      displayName: "Team Lead",
    });

    expect(role).toMatchObject({
      code: "team-lead",
      displayName: "Team Lead",
      departmentId: null,
      locked: false,
      active: true,
    });
  });

  it("creates a role with no department scoping even when one exists in the org", async () => {
    const { admin } = buildAdmin();
    await admin.createDepartment("emp-superadmin", { name: "Engineering", headId: "emp-superadmin" });

    const role = await admin.createRole("emp-superadmin", {
      code: "team-lead",
      displayName: "Team Lead",
    });

    expect(role.departmentId).toBeNull();
  });

  it("rejects a role with a missing code or display name", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createRole("emp-superadmin", { code: "", displayName: "Team Lead" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a duplicate role code in the same organization", async () => {
    const { admin } = buildAdmin();
    await admin.createRole("emp-superadmin", { code: "team-lead", displayName: "Team Lead" });

    await expect(
      admin.createRole("emp-superadmin", { code: "team-lead", displayName: "Team Lead 2" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects deactivating a locked predefined role", async () => {
    const { admin } = buildAdmin([LOCKED_MANAGER_ROLE]);

    await expect(admin.deactivateRole("emp-superadmin", "role-manager")).rejects.toMatchObject({
      code: "locked",
    });
  });

  it("keeps the assignment and published-flow guards for unlocked roles", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });

    await expect(admin.deactivateRole("emp-superadmin", role.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("lets an admin assign a locked predefined role to an employee", async () => {
    const { admin } = buildAdmin([LOCKED_MANAGER_ROLE]);

    await admin.assignRole("emp-superadmin", {
      employeeId: "emp-katherine",
      roleId: "role-manager",
    });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: { code: "manager", displayName: "Manager" },
    });
  });

  it("rejects deactivating a role referenced by a published flow", async () => {
    const { admin } = buildAdmin();
    const targetRole = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });
    const stepRole = await admin.createRole("emp-superadmin", { code: "team-lead", displayName: "Team Lead" });
    const financeExecRole = await admin.createRole("emp-superadmin", {
      code: "finance-executive",
      displayName: "Finance Executive",
    });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Intern flow",
      roleId: targetRole.id,
      steps: [roleStep(stepRole.id), roleStep(financeExecRole.id)],
    });
    await admin.publishFlow("emp-superadmin", flow.id);

    await expect(admin.deactivateRole("emp-superadmin", stepRole.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("allows deactivating a role referenced only by a draft flow", async () => {
    const { admin } = buildAdmin();
    const targetRole = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });
    const stepRole = await admin.createRole("emp-superadmin", { code: "team-lead", displayName: "Team Lead" });
    await admin.createFlow("emp-superadmin", {
      name: "Intern flow",
      roleId: targetRole.id,
      steps: [roleStep(stepRole.id)],
    });

    await expect(admin.deactivateRole("emp-superadmin", stepRole.id)).resolves.toBeUndefined();
  });

  it("lets an admin deactivate an unreferenced custom role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });

    await admin.deactivateRole("emp-superadmin", role.id);

    const roles = await admin.listRoles("emp-superadmin");
    expect(roles.find((candidate) => candidate.id === role.id)).toMatchObject({ active: false });
  });
});

describe("role capabilities", () => {
  const MANAGER_CAPABILITIES = {
    canSubmit: true,
    canApprove: true,
    canAccessFinance: false,
    canHold: false,
    canViewOrganizationActivity: false,
    canAccessAdminConsole: false,
  };

  // A custom role seeded directly into the store with a privilege set,
  // mirroring what the migration and seeds produce for a console-created
  // role.
  const CUSTOM_REVIEWER_ROLE = {
    id: "role-reviewer",
    organizationId: "org-1",
    code: "reviewer",
    displayName: "Reviewer",
    departmentId: null,
    active: true,
    locked: false,
    capabilities: MANAGER_CAPABILITIES,
  };

  const claimWithPendingStepAt = (roleId: string, overrides: Partial<ExpenseClaim> = {}): ExpenseClaim => ({
    id: `claim-${crypto.randomUUID()}`,
    ref: `EXP-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
    organizationId: "org-1",
    requesterId: "emp-shameel",
    title: "Pending at role step",
    category: "Travel",
    subCategory: "",
    remark: "",
    amountMinor: 5000,
    currency: "INR",
    expenseDate: "2026-08-04",
    status: "in-approval",
    currentStage: roleId,
    currentActorId: "emp-ada",
    steps: [
      { id: `step-${crypto.randomUUID()}`, roleId, assignedActorId: "emp-ada", status: "pending" },
    ],
    history: [],
    version: 1,
    createdAt: "2026-08-04T10:00:00.000Z",
    submittedAt: "2026-08-04T10:00:00.000Z",
    ...overrides,
  });

  it("creates a custom role with its privilege set", async () => {
    const { admin } = buildAdmin();

    const role = await admin.createRole("emp-superadmin", {
      code: "reviewer",
      displayName: "Reviewer",
      capabilities: MANAGER_CAPABILITIES,
    });

    expect(role.capabilities).toEqual(MANAGER_CAPABILITIES);
    const roles = await admin.listRoles("emp-superadmin");
    expect(roles.find((candidate) => candidate.id === role.id)?.capabilities).toEqual(
      MANAGER_CAPABILITIES,
    );
  });

  it("creates a custom role with the submit-only default when no set is given", async () => {
    const { admin } = buildAdmin();

    const role = await admin.createRole("emp-superadmin", {
      code: "reviewer",
      displayName: "Reviewer",
    });

    expect(role.capabilities).toEqual({
      canSubmit: true,
      canApprove: false,
      canAccessFinance: false,
      canHold: false,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: false,
    });
  });

  it("rejects a role with a malformed capability set", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createRole("emp-superadmin", {
        code: "reviewer",
        displayName: "Reviewer",
        capabilities: { canSubmit: true } as unknown as RoleCapabilities,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("updates a role's capabilities without confirmation when no action privilege is removed", async () => {
    const { admin } = buildAdmin([CUSTOM_REVIEWER_ROLE]);

    const result = await admin.updateRoleCapabilities("emp-superadmin", "role-reviewer", {
      ...MANAGER_CAPABILITIES,
      canViewOrganizationActivity: true,
    });

    expect(result.role.capabilities).toMatchObject({ canViewOrganizationActivity: true });
    expect(result.pendingClaims).toEqual([]);
    const roles = await admin.listRoles("emp-superadmin");
    expect(roles.find((candidate) => candidate.id === "role-reviewer")?.capabilities).toMatchObject({
      canViewOrganizationActivity: true,
    });
  });

  it("applies a removal without confirmation when no claim is pending at the role's steps", async () => {
    const { admin } = buildAdmin([CUSTOM_REVIEWER_ROLE]);

    await expect(
      admin.updateRoleCapabilities("emp-superadmin", "role-reviewer", {
        ...MANAGER_CAPABILITIES,
        canApprove: false,
      }),
    ).resolves.toMatchObject({ pendingClaims: [] });
  });

  it("rejects an unconfirmed action-privilege removal, carrying the full pending-claim impact", async () => {
    const { admin } = buildAdmin(
      [CUSTOM_REVIEWER_ROLE],
      [claimWithPendingStepAt("role-reviewer", { title: "Reviewer claim one" })],
    );

    const error = await admin
      .updateRoleCapabilities("emp-superadmin", "role-reviewer", {
        ...MANAGER_CAPABILITIES,
        canApprove: false,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).code).toBe("conflict");
    expect((error as AdminError).message).toContain("Removing approve affects 1 pending claim");
    expect((error as AdminError).impact).toEqual({
      removedActionPrivileges: ["canApprove"],
      pendingClaims: [
        expect.objectContaining({ ref: expect.any(String), title: "Reviewer claim one" }),
      ],
    });
  });

  it("applies the removal once confirmed and reports the claims that will skip", async () => {
    const { admin, store } = buildAdmin(
      [CUSTOM_REVIEWER_ROLE],
      [claimWithPendingStepAt("role-reviewer")],
    );

    const result = await admin.updateRoleCapabilities("emp-superadmin", "role-reviewer", {
      ...MANAGER_CAPABILITIES,
      canApprove: false,
    }, { confirmed: true });

    expect(result.role.capabilities).toMatchObject({ canApprove: false });
    expect(result.pendingClaims).toHaveLength(1);
    expect(result.pendingClaims[0]).toMatchObject({ ref: expect.any(String), stage: "Reviewer" });
    const event = store.audit.find((candidate) => candidate.action === "update-role-capabilities");
    expect(event?.detail).toContain("Reviewer");
  });

  it("rejects editing the built-in Superadmin role", async () => {
    const superadminRole = {
      id: "role-superadmin",
      organizationId: "org-1",
      code: "superadmin",
      displayName: "Superadmin",
      departmentId: null,
      active: true,
      locked: true,
      capabilities: {
        canSubmit: true,
        canApprove: true,
        canAccessFinance: true,
        canHold: true,
        canViewOrganizationActivity: true,
        canAccessAdminConsole: true,
      },
    };
    const { admin } = buildAdmin([superadminRole]);

    await expect(
      admin.updateRoleCapabilities("emp-superadmin", "role-superadmin", {
        ...MANAGER_CAPABILITIES,
        canApprove: false,
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "Superadmin privileges are built in and cannot be edited.",
    });
  });

  it("rejects updates from a non-admin actor and to an unknown or inactive role", async () => {
    const { admin } = buildAdmin([CUSTOM_REVIEWER_ROLE]);

    await expect(
      admin.updateRoleCapabilities("emp-katherine", "role-reviewer", MANAGER_CAPABILITIES),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      admin.updateRoleCapabilities("emp-superadmin", "role-missing", MANAGER_CAPABILITIES),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("createFlow", () => {
  it("creates a draft flow assigned to a role with ordered role steps", async () => {
    const { admin } = buildAdmin();
    const executiveRole = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });

    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      steps: [roleStep(managerRole.id)],
    });

    expect(flow).toMatchObject({
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      status: "draft",
      steps: [roleStep(managerRole.id)],
    });
    expect(flow.id).toBeTruthy();
  });

  it("rejects a flow without a name", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", { name: "   ", roleId: role.id, steps: [roleStep(role.id)] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow assigned to an unknown role", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: "role-missing", steps: [] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a duplicate draft flow with the same name and role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const input = { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] };

    await admin.createFlow("emp-superadmin", input);

    await expect(admin.createFlow("emp-superadmin", input)).rejects.toMatchObject({ code: "validation" });
  });

  it("allows the same draft name for a different role", async () => {
    const { admin } = buildAdmin();
    const roleA = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const roleB = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });

    await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: roleA.id, steps: [roleStep(roleA.id)] });

    await expect(
      admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: roleB.id, steps: [roleStep(roleB.id)] }),
    ).resolves.toMatchObject({ roleId: roleB.id });
  });

  it("rejects a flow without any steps", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow with more than 15 steps", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const steps = Array.from({ length: 16 }, () => roleStep(role.id));

    await expect(
      admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow step that is not a known role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Standard reimbursement",
        roleId: role.id,
        steps: [roleStep(role.id), { kind: "role", roleId: "role-missing" }],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("creates a flow mixing role steps and a team-lead step", async () => {
    const { admin } = buildAdmin();
    const internRole = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });

    const flow = await admin.createFlow("emp-superadmin", {
      name: "Intern reimbursement",
      roleId: internRole.id,
      steps: [teamLeadStep, roleStep(managerRole.id)],
    });

    expect(flow.steps).toEqual([{ kind: "team-lead" }, { kind: "role", roleId: managerRole.id }]);
  });

  it("creates a flow whose steps carry amount guards and round-trips them", async () => {
    const { admin } = buildAdmin();
    const internRole = await admin.createRole("emp-superadmin", { code: "intern", displayName: "Intern" });
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    const steps = [
      { kind: "role" as const, roleId: managerRole.id, guard: { operator: "gte" as const, amountMinor: 500000 } },
      { kind: "team-lead" as const, guard: { operator: "lt" as const, amountMinor: 10000 } },
      { kind: "role" as const, roleId: internRole.id },
    ];

    const flow = await admin.createFlow("emp-superadmin", {
      name: "Guarded reimbursement",
      roleId: internRole.id,
      steps,
    });

    expect(flow.steps).toEqual(steps);
    const flows = await admin.listFlows("emp-superadmin");
    expect(flows.find((candidate) => candidate.id === flow.id)?.steps).toEqual(steps);
  });

  it("rejects a guard with an unknown operator", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const guard = { operator: "between", amountMinor: 500000 };

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Guarded reimbursement",
        roleId: role.id,
        steps: [
          { kind: "role", roleId: role.id, guard } as unknown as FlowStepInput,
          roleStep(role.id),
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: 'Unknown guard operator "between".',
    });
  });

  it("rejects a guard with a zero amount", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Guarded reimbursement",
        roleId: role.id,
        steps: [
          { kind: "role", roleId: role.id, guard: { operator: "gte", amountMinor: 0 } },
          roleStep(role.id),
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "The guard amount must be a positive integer (paise).",
    });
  });

  it("rejects a guard with a negative amount", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Guarded reimbursement",
        roleId: role.id,
        steps: [
          { kind: "role", roleId: role.id, guard: { operator: "gte", amountMinor: -100 } },
          roleStep(role.id),
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "The guard amount must be a positive integer (paise).",
    });
  });

  it("rejects a guard with a non-integer amount", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Guarded reimbursement",
        roleId: role.id,
        steps: [
          { kind: "role", roleId: role.id, guard: { operator: "gte", amountMinor: 100.5 } },
          roleStep(role.id),
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "The guard amount must be a positive integer (paise).",
    });
  });

  it("rejects a guard on the terminal step", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Guarded reimbursement",
        roleId: role.id,
        steps: [
          roleStep(role.id),
          { kind: "role", roleId: role.id, guard: { operator: "gte", amountMinor: 500000 } },
        ],
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "The terminal step of a flow cannot be guarded.",
    });
  });

  it("rejects a team-lead step that carries a role id", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Standard reimbursement",
        roleId: role.id,
        steps: [{ kind: "team-lead", roleId: role.id }] as unknown as FlowStepInput[],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a role step without a role id", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Standard reimbursement",
        roleId: role.id,
        steps: [{ kind: "role" }] as unknown as FlowStepInput[],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an unknown step kind", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-superadmin", {
        name: "Standard reimbursement",
        roleId: role.id,
        steps: [{ kind: "ceo" }] as unknown as FlowStepInput[],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await expect(
      admin.createFlow("emp-katherine", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("records an audit event when a flow draft is created", async () => {
    const { admin, store } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });

    await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] });

    expect(store.audit.map((event) => event.action)).toContain("create-flow-draft");
  });
});

describe("updateFlow", () => {
  it("updates an existing flow definition and records an audit event", async () => {
    const { admin, store } = buildAdmin();
    const role1 = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const role2 = await admin.createRole("emp-superadmin", { code: "finance", displayName: "Finance" });
    const flow = await admin.createFlow("emp-superadmin", { name: "Initial Flow", roleId: role1.id, steps: [roleStep(role1.id)] });

    const updated = await admin.updateFlow("emp-superadmin", flow.id, {
      name: "Updated Flow Name",
      roleId: role1.id,
      steps: [roleStep(role1.id), roleStep(role2.id)],
    });

    expect(updated).toMatchObject({
      id: flow.id,
      name: "Updated Flow Name",
      steps: [roleStep(role1.id), roleStep(role2.id)],
    });
    expect(store.audit.map((e) => e.action)).toContain("update-flow");
  });

  it("updates a flow to carry amount guards and round-trips them", async () => {
    const { admin } = buildAdmin();
    const role1 = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const role2 = await admin.createRole("emp-superadmin", { code: "finance", displayName: "Finance" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Initial Flow",
      roleId: role1.id,
      steps: [roleStep(role1.id), roleStep(role2.id)],
    });
    const guardedSteps = [
      { kind: "role" as const, roleId: role1.id, guard: { operator: "gte" as const, amountMinor: 500000 } },
      { kind: "role" as const, roleId: role2.id },
    ];
    const updated = await admin.updateFlow("emp-superadmin", flow.id, {
      name: "Guarded Flow",
      roleId: role1.id,
      steps: guardedSteps,
    });

    expect(updated.steps).toEqual(guardedSteps);
    const flows = await admin.listFlows("emp-superadmin");
    expect(flows.find((candidate) => candidate.id === flow.id)?.steps).toEqual(guardedSteps);
  });
});

describe("publishFlow", () => {
  it("publishes a draft flow", async () => {
    const { admin } = buildAdmin();
    const executiveRole = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      steps: [roleStep(executiveRole.id), roleStep(financeExecRole.id)],
    });

    const published = await admin.publishFlow("emp-superadmin", flow.id);

    expect(published.status).toBe("published");
  });

  it("publishes a draft flow with a valid amount guard on a non-terminal step", async () => {
    const { admin } = buildAdmin();
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const guardedSteps = [
      { kind: "role" as const, roleId: managerRole.id, guard: { operator: "gte" as const, amountMinor: 500000 } },
      { kind: "role" as const, roleId: financeExecRole.id },
    ];
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Guarded reimbursement",
      roleId: managerRole.id,
      steps: guardedSteps,
    });

    const published = await admin.publishFlow("emp-superadmin", flow.id);

    expect(published.status).toBe("published");
    expect(published.steps).toEqual(guardedSteps);
  });

  it("rejects publishing a flow whose terminal step carries an amount guard", async () => {
    const { admin, store } = buildAdmin();
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    // The store is written directly to bypass the create-flow guard
    // validation: publish re-validates and must refuse the guarded
    // terminal step.
    const flow = await store.createFlow("org-1", {
      name: "Unsafe reimbursement",
      roleId: managerRole.id,
      steps: [
        { kind: "role", roleId: managerRole.id },
        { kind: "role", roleId: financeExecRole.id, guard: { operator: "gte", amountMinor: 500000 } },
      ],
    });

    await expect(admin.publishFlow("emp-superadmin", flow.id)).rejects.toMatchObject({
      code: "validation",
      message: "The terminal step of a flow cannot be guarded.",
    });
  });

  it("allows multiple flows to remain active and published concurrently", async () => {
    const { admin } = buildAdmin();
    const role1 = await admin.createRole("emp-superadmin", { code: "intern-eng", displayName: "Engineering Intern" });
    const role2 = await admin.createRole("emp-superadmin", { code: "intern-mkt", displayName: "Marketing Intern" });
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const firstFlow = await admin.createFlow("emp-superadmin", {
      name: "Engineering Flow",
      roleId: role1.id,
      steps: [roleStep(role1.id), roleStep(financeExecRole.id)],
    });
    await admin.publishFlow("emp-superadmin", firstFlow.id);
    const secondFlow = await admin.createFlow("emp-superadmin", {
      name: "Marketing Flow",
      roleId: role2.id,
      steps: [roleStep(role2.id), roleStep(financeExecRole.id)],
    });

    await admin.publishFlow("emp-superadmin", secondFlow.id);

    const flows = await admin.listFlows("emp-superadmin");
    expect(flows.find((flow) => flow.id === firstFlow.id)).toMatchObject({ status: "published" });
    expect(flows.find((flow) => flow.id === secondFlow.id)).toMatchObject({ status: "published" });
  });

  it("rejects publishing an already-published flow", async () => {
    const { admin } = buildAdmin();
    const executiveRole = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      steps: [roleStep(executiveRole.id), roleStep(financeExecRole.id)],
    });
    await admin.publishFlow("emp-superadmin", flow.id);

    await expect(admin.publishFlow("emp-superadmin", flow.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects publishing an unknown flow", async () => {
    const { admin } = buildAdmin();

    await expect(admin.publishFlow("emp-superadmin", "flow-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const flow = await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] });

    await expect(admin.publishFlow("emp-katherine", flow.id)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("rejects publishing a flow whose last step is not the Finance Executive role", async () => {
    const { admin } = buildAdmin();
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const managerRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: financeExecRole.id,
      steps: [roleStep(financeExecRole.id), roleStep(managerRole.id)],
    });

    await expect(admin.publishFlow("emp-superadmin", flow.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects publishing a flow whose last step is a team-lead step", async () => {
    const { admin } = buildAdmin();
    const executiveRole = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      steps: [roleStep(executiveRole.id), teamLeadStep],
    });

    await expect(admin.publishFlow("emp-superadmin", flow.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects publishing a flow whose last step role is inactive", async () => {
    const { admin } = buildAdmin();
    const financeExecRole = await admin.createRole("emp-superadmin", { code: "finance-executive", displayName: "Finance Executive" });
    const stepRole = await admin.createRole("emp-superadmin", { code: "manager", displayName: "Manager" });
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Standard reimbursement",
      roleId: financeExecRole.id,
      steps: [roleStep(financeExecRole.id), roleStep(stepRole.id)],
    });
    await admin.deactivateRole("emp-superadmin", stepRole.id);

    await expect(admin.publishFlow("emp-superadmin", flow.id)).rejects.toMatchObject({
      code: "validation",
    });
  });
});

describe("listEmployees and listFlows", () => {
  it("lists people to an authorized administrator", async () => {
    const { admin } = buildAdmin();

    const people = await admin.listEmployees("emp-superadmin");

    expect(people).toHaveLength(3);
    expect(people[0]).toMatchObject({ name: "Katherine Johnson", role: null });
    expect(people[1]).toMatchObject({ name: "Muhammad Shameel", role: { displayName: "Superadmin" } });
  });

  it("only returns people from the actor's own organization", async () => {
    const { admin } = buildAdmin();

    const people = await admin.listEmployees("emp-superadmin");

    expect(people.map((person) => person.id)).not.toContain("emp-other-org");
  });

  it("rejects reads from a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(admin.listEmployees("emp-katherine")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(admin.listFlows("emp-katherine")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("returns empty flow history when no flows exist", async () => {
    const { admin } = buildAdmin();

    await expect(admin.listFlows("emp-superadmin")).resolves.toEqual([]);
  });
});

describe("deleteFlow", () => {
  it("deletes a flow draft", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const flow = await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] });

    await admin.deleteFlow("emp-superadmin", flow.id);

    const flows = await admin.listFlows("emp-superadmin");
    expect(flows.find((candidate) => candidate.id === flow.id)).toBeUndefined();
  });

  it("rejects deleting an unknown flow", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deleteFlow("emp-superadmin", "flow-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("createEmployee (store)", () => {
  it("creates an active employee with no role, department, or manager", async () => {
    const { admin, store } = buildAdmin();

    const employee = await store.createEmployee("org-1", {
      id: "emp-provisioned",
      name: "John Doe",
      email: "john.doe@hive.local",
    });

    expect(employee).toEqual({
      id: "emp-provisioned",
      organizationId: "org-1",
      name: "John Doe",
      email: "john.doe@hive.local",
      department: "",
      departmentId: null,
      role: null,
      active: true,
      managerId: null,
    });
    const people = await admin.listEmployees("emp-superadmin");
    expect(people.some((person) => person.id === "emp-provisioned")).toBe(true);
  });

  it("leaves existing employees untouched when a new employee is created", async () => {
    const { store } = buildAdmin();

    await store.createEmployee("org-1", {
      id: "emp-provisioned",
      name: "John Doe",
      email: "john.doe@hive.local",
    });

    const people = await store.listEmployees("org-1");
    expect(people).toHaveLength(4);
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: null,
      active: true,
    });
  });
});

describe("deactivateEmployee", () => {
  it("deactivates a normal employee and records an audit event", async () => {
    const { admin, store } = buildAdmin();

    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      active: false,
    });
    const event = store.audit.find((candidate) => candidate.action === "deactivate-employee");
    expect(event).toMatchObject({ actorId: "emp-superadmin", action: "deactivate-employee" });
    expect(event?.detail).toContain("Katherine Johnson");
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateEmployee("emp-katherine", "emp-superadmin")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("rejects deactivating an unknown employee", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateEmployee("emp-superadmin", "emp-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects deactivating an employee outside the actor's organization", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateEmployee("emp-superadmin", "emp-other-org")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects self-deactivation", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateEmployee("emp-superadmin", "emp-superadmin")).rejects.toMatchObject({
      code: "conflict",
      message: "You cannot deactivate your own account.",
    });
  });

  it("rejects deactivating the last active Superadmin", async () => {
    // The actor is a Superadmin who is already inactive (the sign-in seam
    // blocks deactivated users in a later slice), so the target is the only
    // remaining active Superadmin in the org.
    const store = new InMemoryAdminStore([
      {
        id: "emp-superadmin",
        organizationId: "org-1",
        name: "Super Admin",
        email: "superadmin@hive.local",
        department: "Operations",
        role: SUPERADMIN_ROLE,
        active: false,
        managerId: null,
      },
      {
        id: "emp-shameel",
        organizationId: "org-1",
        name: "Muhammad Shameel",
        email: "muhammadshameelks@hive.local",
        department: "Engineering",
        role: SUPERADMIN_ROLE,
        active: true,
        managerId: null,
      },
    ]);
    const admin = createAdminCommands({
      store,
      expensesStore: new InMemoryExpenseStore({ employees: [] }),
    });

    await expect(admin.deactivateEmployee("emp-superadmin", "emp-shameel")).rejects.toMatchObject({
      code: "conflict",
      message: "The last active Superadmin cannot be deactivated.",
    });
  });

  it("lets a Superadmin deactivate another Superadmin when another active Superadmin remains", async () => {
    const { admin, store } = buildAdmin();

    await admin.deactivateEmployee("emp-superadmin", "emp-shameel");

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-shameel")).toMatchObject({ active: false });
    expect(store.audit.some((event) => event.action === "deactivate-employee")).toBe(true);
  });
});

describe("reactivateEmployee", () => {
  it("reactivates a deactivated employee and records an audit event", async () => {
    const { admin, store } = buildAdmin();
    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    await admin.reactivateEmployee("emp-superadmin", "emp-katherine");

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({ active: true });
    const event = store.audit.find((candidate) => candidate.action === "reactivate-employee");
    expect(event).toMatchObject({ actorId: "emp-superadmin", action: "reactivate-employee" });
    expect(event?.detail).toContain("Katherine Johnson");
  });

  it("rejects reactivating an unknown employee", async () => {
    const { admin } = buildAdmin();

    await expect(admin.reactivateEmployee("emp-superadmin", "emp-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(admin.reactivateEmployee("emp-katherine", "emp-superadmin")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("assignManager", () => {
  it("assigns a manager and records an audit event", async () => {
    const { admin, store } = buildAdmin();

    await admin.assignManager("emp-superadmin", {
      employeeId: "emp-katherine",
      managerId: "emp-shameel",
    });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      managerId: "emp-shameel",
    });
    const event = store.audit.find((candidate) => candidate.action === "assign-manager");
    expect(event?.detail).toContain("Katherine Johnson now reports to Muhammad Shameel");
  });

  it("clears a manager assignment with a 'cleared' audit detail", async () => {
    const { admin, store } = buildAdmin();
    await admin.assignManager("emp-superadmin", {
      employeeId: "emp-katherine",
      managerId: "emp-shameel",
    });

    await admin.assignManager("emp-superadmin", { employeeId: "emp-katherine", managerId: null });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      managerId: null,
    });
    const events = store.audit.filter((candidate) => candidate.action === "assign-manager");
    expect(events).toHaveLength(2);
    expect(events[1]?.detail).toContain("Cleared");
  });

  it("does not duplicate the assignment or audit event when the manager is unchanged", async () => {
    const { admin, store } = buildAdmin();
    await admin.assignManager("emp-superadmin", {
      employeeId: "emp-katherine",
      managerId: "emp-shameel",
    });

    await admin.assignManager("emp-superadmin", {
      employeeId: "emp-katherine",
      managerId: "emp-shameel",
    });

    expect(store.audit.filter((event) => event.action === "assign-manager")).toHaveLength(1);
  });

  it("rejects assigning an employee as their own manager", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignManager("emp-superadmin", {
        employeeId: "emp-katherine",
        managerId: "emp-katherine",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: "An employee cannot be their own manager.",
    });
  });

  it("rejects a manager from another organization", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignManager("emp-superadmin", {
        employeeId: "emp-katherine",
        managerId: "emp-other-org",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an unknown manager", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignManager("emp-superadmin", {
        employeeId: "emp-katherine",
        managerId: "emp-missing",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a deactivated manager", async () => {
    const { admin } = buildAdmin();
    await admin.deactivateEmployee("emp-superadmin", "emp-shameel");

    await expect(
      admin.assignManager("emp-superadmin", {
        employeeId: "emp-katherine",
        managerId: "emp-shameel",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects assigning a manager to an unknown employee", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignManager("emp-superadmin", { employeeId: "emp-missing", managerId: null }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignManager("emp-katherine", { employeeId: "emp-superadmin", managerId: null }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("listAuditEvents", () => {
  const seededEvents: AuditEvent[] = [
    {
      id: "audit-1",
      organizationId: "org-1",
      actorId: "emp-superadmin",
      action: "assign-role",
      detail: "Katherine Johnson assigned to the Manager role.",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
    },
    {
      id: "audit-2",
      organizationId: "org-1",
      actorId: "emp-shameel",
      action: "create-department",
      detail: 'Created the "Engineering" department.',
      createdAt: new Date("2026-08-05T09:00:00.000Z"),
    },
    {
      id: "audit-3",
      organizationId: "org-1",
      actorId: "emp-shameel",
      action: "assign-role",
      detail: "Katherine Johnson assigned to the Executive role.",
      createdAt: new Date("2026-08-10T08:00:00.000Z"),
    },
    {
      id: "audit-4",
      organizationId: "org-1",
      actorId: "emp-superadmin",
      action: "create-flow-draft",
      detail: 'Created the "Standard reimbursement" flow draft.',
      createdAt: new Date("2026-08-10T09:00:00.000Z"),
    },
    {
      id: "audit-other-org",
      organizationId: "org-2",
      actorId: "emp-other-org",
      action: "create-role",
      detail: 'Created the "Executive" role.',
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
    },
  ];

  function buildAdminWithAudit(events: AuditEvent[] = seededEvents) {
    const { admin, store } = buildAdmin();
    store.audit.push(...events);
    return { admin, store };
  }

  it("rejects a non-superadmin actor", async () => {
    const { admin } = buildAdminWithAudit();

    await expect(
      admin.listAuditEvents("emp-katherine", {}, { page: 1, pageSize: 50 }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("lists the actor's own organization newest first and excludes other orgs", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents("emp-superadmin", {}, { page: 1, pageSize: 50 });

    expect(result.total).toBe(4);
    expect(result.events.map((event) => event.id)).toEqual([
      "audit-4",
      "audit-3",
      "audit-2",
      "audit-1",
    ]);
  });

  it("breaks timestamp ties by id descending", async () => {
    const { admin } = buildAdminWithAudit([
      {
        id: "audit-a",
        organizationId: "org-1",
        actorId: "emp-superadmin",
        action: "create-role",
        detail: "",
        createdAt: new Date("2026-08-06T00:00:00.000Z"),
      },
      {
        id: "audit-b",
        organizationId: "org-1",
        actorId: "emp-superadmin",
        action: "create-role",
        detail: "",
        createdAt: new Date("2026-08-06T00:00:00.000Z"),
      },
    ]);

    const result = await admin.listAuditEvents("emp-superadmin", {}, { page: 1, pageSize: 50 });

    expect(result.events.map((event) => event.id)).toEqual(["audit-b", "audit-a"]);
  });

  it("filters by actor", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents(
      "emp-superadmin",
      { actorId: "emp-shameel" },
      { page: 1, pageSize: 50 },
    );

    expect(result.total).toBe(2);
    expect(result.events.map((event) => event.id)).toEqual(["audit-3", "audit-2"]);
  });

  it("filters by action", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents(
      "emp-superadmin",
      { action: "assign-role" },
      { page: 1, pageSize: 50 },
    );

    expect(result.total).toBe(2);
    expect(result.events.map((event) => event.id)).toEqual(["audit-3", "audit-1"]);
  });

  it("filters from a bare from date inclusively from the start of that day", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents(
      "emp-superadmin",
      { from: "2026-08-05" },
      { page: 1, pageSize: 50 },
    );

    expect(result.total).toBe(3);
    expect(result.events.map((event) => event.id)).toEqual(["audit-4", "audit-3", "audit-2"]);
  });

  it("treats a bare to date as inclusive of that whole day", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents(
      "emp-superadmin",
      { to: "2026-08-05" },
      { page: 1, pageSize: 50 },
    );

    expect(result.total).toBe(2);
    expect(result.events.map((event) => event.id)).toEqual(["audit-2", "audit-1"]);
  });

  it("combines actor, action, and an inclusive date range", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents(
      "emp-superadmin",
      { actorId: "emp-shameel", action: "assign-role", from: "2026-08-01", to: "2026-08-31" },
      { page: 1, pageSize: 50 },
    );

    expect(result.total).toBe(1);
    expect(result.events.map((event) => event.id)).toEqual(["audit-3"]);
  });

  it("paginates with a stable total across pages", async () => {
    const { admin } = buildAdminWithAudit();

    const firstPage = await admin.listAuditEvents(
      "emp-superadmin",
      {},
      { page: 1, pageSize: 2 },
    );
    const secondPage = await admin.listAuditEvents(
      "emp-superadmin",
      {},
      { page: 2, pageSize: 2 },
    );

    expect(firstPage.events.map((event) => event.id)).toEqual(["audit-4", "audit-3"]);
    expect(firstPage.total).toBe(4);
    expect(secondPage.events.map((event) => event.id)).toEqual(["audit-2", "audit-1"]);
    expect(secondPage.total).toBe(4);
  });

  it("returns an empty page beyond the last event", async () => {
    const { admin } = buildAdminWithAudit();

    const result = await admin.listAuditEvents("emp-superadmin", {}, { page: 9, pageSize: 50 });

    expect(result).toEqual({ events: [], total: 4 });
  });

  it("clamps page and pageSize to the supported range with a 50 default", async () => {
    const { admin } = buildAdminWithAudit();

    const clamped = await admin.listAuditEvents("emp-superadmin", {}, { page: 0, pageSize: 0 });
    expect(clamped).toEqual({
      events: [seededEvents[3]],
      total: 4,
    });

    const defaults = await admin.listAuditEvents("emp-superadmin", {});
    expect(defaults.total).toBe(4);
    expect(defaults.events.map((event) => event.id)).toEqual([
      "audit-4",
      "audit-3",
      "audit-2",
      "audit-1",
    ]);
  });
});

describe("createDepartment with a head", () => {
  it("creates a department carrying its head", async () => {
    const { admin } = buildAdmin();

    const department = await admin.createDepartment("emp-superadmin", {
      name: "Research",
      headId: "emp-katherine",
    });

    expect(department).toMatchObject({
      name: "Research",
      active: true,
      headId: "emp-katherine",
      head: { id: "emp-katherine", name: "Katherine Johnson" },
    });
  });

  it("rejects a head from another organization", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createDepartment("emp-superadmin", { name: "Research", headId: "emp-other-org" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a deactivated head", async () => {
    const { admin } = buildAdmin();
    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    await expect(
      admin.createDepartment("emp-superadmin", { name: "Research", headId: "emp-katherine" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an unknown head", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createDepartment("emp-superadmin", { name: "Research", headId: "emp-missing" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("setDepartmentHead", () => {
  it("changes the head of a department and records an audit event", async () => {
    const { admin, store } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });

    await admin.setDepartmentHead("emp-superadmin", {
      departmentId: department.id,
      headId: "emp-katherine",
    });

    const departments = await admin.listDepartments("emp-superadmin");
    expect(departments.find((candidate) => candidate.id === department.id)).toMatchObject({
      headId: "emp-katherine",
      head: { id: "emp-katherine", name: "Katherine Johnson" },
    });
    const event = store.audit.find((candidate) => candidate.action === "set-department-head");
    expect(event?.detail).toContain(
      "Katherine Johnson is now the head of the Engineering department",
    );
  });

  it("does not duplicate the audit event when the head is unchanged", async () => {
    const { admin, store } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });

    await admin.setDepartmentHead("emp-superadmin", {
      departmentId: department.id,
      headId: "emp-superadmin",
    });

    expect(store.audit.filter((event) => event.action === "set-department-head")).toHaveLength(0);
  });

  it("rejects an unknown department", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.setDepartmentHead("emp-superadmin", {
        departmentId: "dept-missing",
        headId: "emp-katherine",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a head outside the organization", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });

    await expect(
      admin.setDepartmentHead("emp-superadmin", {
        departmentId: department.id,
        headId: "emp-other-org",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a deactivated head", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });
    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    await expect(
      admin.setDepartmentHead("emp-superadmin", {
        departmentId: department.id,
        headId: "emp-katherine",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });

    await expect(
      admin.setDepartmentHead("emp-katherine", {
        departmentId: department.id,
        headId: "emp-superadmin",
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("createEmployee", () => {
  async function buildWithDefaults() {
    const { admin, store } = buildAdmin();
    const executive = await store.createRole("org-1", {
      code: "executive",
      displayName: "Executive",
    });
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });
    return { admin, store, executive, department };
  }

  it("creates an employee whose manager defaults to the department head", async () => {
    const { admin, store, executive, department } = await buildWithDefaults();

    const employee = await admin.createEmployee("emp-superadmin", {
      name: "Grace Hopper",
      email: "grace@hive.local",
      roleId: executive.id,
      departmentId: department.id,
    });

    expect(employee).toMatchObject({
      name: "Grace Hopper",
      email: "grace@hive.local",
      department: "Engineering",
      departmentId: department.id,
      managerId: "emp-superadmin",
      active: true,
    });
    const people = await store.listEmployees("org-1");
    expect(people.some((person) => person.id === employee.id)).toBe(true);
  });

  it("honors an explicit manager override", async () => {
    const { admin, executive, department } = await buildWithDefaults();

    const employee = await admin.createEmployee("emp-superadmin", {
      name: "Grace Hopper",
      email: "grace@hive.local",
      roleId: executive.id,
      departmentId: department.id,
      managerId: "emp-katherine",
    });

    expect(employee.managerId).toBe("emp-katherine");
  });

  it("rejects a duplicate email, matching case-insensitively", async () => {
    const { admin, executive, department } = await buildWithDefaults();

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "Grace Hopper",
        email: "Katherine@hive.local",
        roleId: executive.id,
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({
      code: "validation",
      message: 'An employee with email "katherine@hive.local" already exists.',
    });
  });

  it("rejects an invalid email address", async () => {
    const { admin, executive, department } = await buildWithDefaults();

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "Grace Hopper",
        email: "not-an-email",
        roleId: executive.id,
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a missing name", async () => {
    const { admin, executive, department } = await buildWithDefaults();

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "   ",
        email: "grace@hive.local",
        roleId: executive.id,
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an unknown role", async () => {
    const { admin, department } = await buildWithDefaults();

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: "role-missing",
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects an inactive department", async () => {
    const { admin, executive, department } = await buildWithDefaults();
    await admin.deactivateDepartment("emp-superadmin", department.id);

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: executive.id,
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects a deactivated manager override", async () => {
    const { admin, executive, department } = await buildWithDefaults();
    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    await expect(
      admin.createEmployee("emp-superadmin", {
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: executive.id,
        departmentId: department.id,
        managerId: "emp-katherine",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("records an audit event for the creation", async () => {
    const { admin, store, executive, department } = await buildWithDefaults();

    await admin.createEmployee("emp-superadmin", {
      name: "Grace Hopper",
      email: "grace@hive.local",
      roleId: executive.id,
      departmentId: department.id,
    });

    const event = store.audit.find((candidate) => candidate.action === "create-employee");
    expect(event).toMatchObject({ actorId: "emp-superadmin", action: "create-employee" });
    expect(event?.detail).toContain("Grace Hopper created");
  });

  it("rejects a non-admin actor", async () => {
    const { admin, executive, department } = await buildWithDefaults();

    await expect(
      admin.createEmployee("emp-katherine", {
        name: "Grace Hopper",
        email: "grace@hive.local",
        roleId: executive.id,
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("importEmployees", () => {
  const CSV_HEADER = "name,email,role,department,manager";

  async function buildWithDefaults() {
    const { admin, store } = buildAdmin();
    await store.createRole("org-1", { code: "executive", displayName: "Executive" });
    const department = await admin.createDepartment("emp-superadmin", {
      name: "Engineering",
      headId: "emp-superadmin",
    });
    return { admin, store, department };
  }

  it("imports a roster with managers defaulted to department heads", async () => {
    const { admin, store } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,\nAda Iyer,ada.iyer@hive.local,executive,Engineering,\n`,
    });

    expect(result.created).toHaveLength(2);
    expect(result.failed).toEqual([]);
    const people = await store.listEmployees("org-1");
    const grace = people.find((person) => person.email === "grace@hive.local");
    expect(grace).toMatchObject({
      name: "Grace Hopper",
      department: "Engineering",
      managerId: "emp-superadmin",
    });
    const ada = people.find((person) => person.email === "ada.iyer@hive.local");
    expect(ada).toMatchObject({ managerId: "emp-superadmin" });
    const event = store.audit.find((candidate) => candidate.action === "import-employees");
    expect(event?.detail).toContain("Imported 2 employees");
  });

  it("honors a per-row manager override by email", async () => {
    const { admin } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,katherine@hive.local\n`,
    });

    expect(result.failed).toEqual([]);
    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.email === "grace@hive.local")?.managerId).toBe(
      "emp-katherine",
    );
  });

  it("matches roles by display name case-insensitively", async () => {
    const { admin } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,EXECUTIVE,Engineering,\n`,
    });

    expect(result.failed).toEqual([]);
    expect(result.created).toHaveLength(1);
  });

  it("writes nothing when any row fails, reporting per-row errors", async () => {
    const { admin, store } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,\nBad Row,bad@hive.local,no-such-role,Engineering,\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({
      rowNumber: 3,
      email: "bad@hive.local",
      status: "failed",
    });
    expect(result.failed[0]?.error).toContain('Unknown role "no-such-role"');
    const people = await store.listEmployees("org-1");
    expect(people.some((person) => person.email === "grace@hive.local")).toBe(false);
  });

  it("flags duplicate emails within the file", async () => {
    const { admin } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,\nGrace Again,grace@hive.local,executive,Engineering,\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.error).toContain("Duplicate email within the file.");
  });

  it("flags emails that already exist in the organization", async () => {
    const { admin } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,katherine@hive.local,executive,Engineering,\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed[0]?.error).toContain("already exists");
  });

  it("requires a head when no manager override is given", async () => {
    const { admin, store } = await buildWithDefaults();
    await admin.createDepartment("emp-superadmin", {
      name: "Headless",
      headId: "emp-superadmin",
    });
    // Simulate a pre-migration headless department (rows created before
    // 0026): the head reference is nulled on the stored row.
    const stored = store as unknown as { departments: AdminDepartment[] };
    const headless = stored.departments.find((department) => department.name === "Headless");
    if (headless) {
      headless.headId = null;
      headless.head = null;
    }

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Headless,\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed[0]?.error).toContain(
      'The "Headless" department has no head; assign one before importing members.',
    );
  });

  it("rejects an unknown manager email", async () => {
    const { admin } = await buildWithDefaults();

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,nobody@hive.local\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed[0]?.error).toContain('Unknown manager "nobody@hive.local"');
  });

  it("rejects a deactivated manager email", async () => {
    const { admin } = await buildWithDefaults();
    await admin.deactivateEmployee("emp-superadmin", "emp-katherine");

    const result = await admin.importEmployees("emp-superadmin", {
      csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,katherine@hive.local\n`,
    });

    expect(result.created).toEqual([]);
    expect(result.failed[0]?.error).toContain("A deactivated employee cannot be a manager.");
  });

  it("rejects a structurally broken CSV without touching the store", async () => {
    const { admin, store } = await buildWithDefaults();

    await expect(
      admin.importEmployees("emp-superadmin", { csv: "no header here\nAda,ada@hive.local" }),
    ).rejects.toMatchObject({ code: "validation" });
    const people = await store.listEmployees("org-1");
    expect(people).toHaveLength(3);
  });

  it("rejects an empty roster", async () => {
    const { admin } = await buildWithDefaults();

    await expect(
      admin.importEmployees("emp-superadmin", {
        csv: `${CSV_HEADER}\n`,
      }),
    ).rejects.toMatchObject({ code: "validation", message: "The CSV has no rows to import." });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = await buildWithDefaults();

    await expect(
      admin.importEmployees("emp-katherine", {
        csv: `${CSV_HEADER}\nGrace Hopper,grace@hive.local,executive,Engineering,\n`,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("absence timeout setting", () => {
  it("reads the default 3-day timeout when no setting exists", async () => {
    const { admin } = buildAdmin();

    await expect(admin.getAbsenceTimeoutDays("emp-superadmin")).resolves.toBe(3);
  });

  it("stores and reads back a configured timeout for the actor's organization", async () => {
    const { admin } = buildAdmin();

    await admin.setAbsenceTimeoutDays("emp-superadmin", 7);

    await expect(admin.getAbsenceTimeoutDays("emp-superadmin")).resolves.toBe(7);
  });

  it("keeps organizations independent", async () => {
    const { admin } = buildAdmin();
    const store = new InMemoryAdminStore([
      ...employees.map((employee) => ({ ...employee })),
      {
        id: "emp-org2-superadmin",
        organizationId: "org-2",
        name: "Org Two Superadmin",
        email: "org2superadmin@hive.local",
        department: "Operations",
        role: SUPERADMIN_ROLE,
        active: true,
        managerId: null,
      },
    ]);
    const orgTwoAdmin = createAdminCommands({
      store,
      expensesStore: new InMemoryExpenseStore({ employees: [] }),
    });

    await admin.setAbsenceTimeoutDays("emp-superadmin", 7);

    await expect(orgTwoAdmin.getAbsenceTimeoutDays("emp-org2-superadmin")).resolves.toBe(3);
  });

  it("rejects a non-integer, below-one, or above-ceiling value", async () => {
    const { admin } = buildAdmin();

    for (const days of [0, -1, 1.5, 91, 100]) {
      await expect(admin.setAbsenceTimeoutDays("emp-superadmin", days)).rejects.toMatchObject({
        code: "validation",
      });
    }
    await expect(admin.getAbsenceTimeoutDays("emp-superadmin")).resolves.toBe(3);
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(admin.getAbsenceTimeoutDays("emp-katherine")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(admin.setAbsenceTimeoutDays("emp-katherine", 5)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("rejects a custom role with admin-console access that is not Superadmin", async () => {
    const { admin } = buildAdmin();

    const role = await admin.createRole("emp-superadmin", {
      code: "ops-admin",
      displayName: "Ops Admin",
    });
    await admin.updateRoleCapabilities("emp-superadmin", role.id, {
      canSubmit: true,
      canApprove: false,
      canAccessFinance: false,
      canHold: false,
      canViewOrganizationActivity: false,
      canAccessAdminConsole: true,
    });
    await admin.assignRole("emp-superadmin", { employeeId: "emp-katherine", roleId: role.id });

    // Sanity check: the role does grant admin-console access elsewhere.
    await expect(admin.getAdminActor("emp-katherine")).resolves.not.toBeNull();

    await expect(admin.getAbsenceTimeoutDays("emp-katherine")).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(admin.setAbsenceTimeoutDays("emp-katherine", 5)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("records an audit event when the timeout changes", async () => {
    const { admin, store } = buildAdmin();

    await admin.setAbsenceTimeoutDays("emp-superadmin", 10);

    const { events } = await store.listAuditEvents("org-1", {}, { page: 1, pageSize: 50 });
    expect(events[0]).toMatchObject({
      action: "set-absence-timeout",
      detail: "Absence auto-skip timeout set to 10 days.",
    });
  });
});
