import { describe, expect, it } from "vitest";
import { AdminError, createAdminCommands } from "./commands";
import { InMemoryAdminStore } from "./in-memory";
import type { AdminEmployee, AuditEvent } from "./ports";

const SUPERADMIN_ROLE = { id: "role-superadmin", code: "superadmin", displayName: "Superadmin" };
const HR_ADMIN_ROLE = { id: "role-hr-admin", code: "hr-administrator", displayName: "HR administrator" };

const employees: AdminEmployee[] = [
  {
    id: "emp-grace",
    organizationId: "org-1",
    name: "Grace Hopper",
    email: "grace@hive.local",
    department: "Operations",
    role: HR_ADMIN_ROLE,
  },
  {
    id: "emp-shameel",
    organizationId: "org-1",
    name: "Muhammad Shameel",
    email: "muhammadshameelks@hive.local",
    department: "Engineering",
    role: SUPERADMIN_ROLE,
  },
  {
    id: "emp-katherine",
    organizationId: "org-1",
    name: "Katherine Johnson",
    email: "katherine@hive.local",
    department: "Engineering",
    role: null,
  },
  {
    id: "emp-other-org",
    organizationId: "org-2",
    name: "Other Org Person",
    email: "other@other.local",
    department: "Operations",
    role: HR_ADMIN_ROLE,
  },
];

function buildAdmin() {
  const store = new InMemoryAdminStore(employees.map((employee) => ({ ...employee })));
  const admin = createAdminCommands({ store });
  return { admin, store };
}

describe("getAdminActor", () => {
  it("returns the actor for an HR administrator", async () => {
    const { admin } = buildAdmin();

    const actor = await admin.getAdminActor("emp-grace");

    expect(actor).toMatchObject({ id: "emp-grace", role: { code: "hr-administrator" } });
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
  it("lets an HR administrator assign a role to an employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id });

    const people = await admin.listEmployees("emp-grace");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: { displayName: "Manager" },
    });
  });

  it("lets a Superadmin assign a role to an employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "finance-reviewer",
      displayName: "Finance reviewer",
      departmentId: null,
    });

    await admin.assignRole("emp-shameel", { employeeId: "emp-katherine", roleId: role.id });

    const people = await admin.listEmployees("emp-shameel");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: { displayName: "Finance reviewer" },
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await expect(
      admin.assignRole("emp-katherine", { employeeId: "emp-grace", roleId: role.id }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects an unknown target employee", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await expect(
      admin.assignRole("emp-grace", { employeeId: "emp-missing", roleId: role.id }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects assigning a role to an employee outside the actor's organization", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await expect(
      admin.assignRole("emp-grace", { employeeId: "emp-other-org", roleId: role.id }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an unknown role id", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: "role-missing" }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects assigning an inactive role", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });
    await store.deactivateRole(role.id);

    await expect(
      admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("names AdminError for readable stack traces", async () => {
    const { admin } = buildAdmin();

    const error = await admin
      .assignRole("emp-grace", { employeeId: "emp-katherine", roleId: "role-missing" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminError);
    expect((error as AdminError).name).toBe("AdminError");
  });

  it("records an audit event for a role assignment", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id });

    const events: AuditEvent[] = store.audit;
    expect(events).toHaveLength(1);
    const assignEvent = events.find((event) => event.action === "assign-role");
    expect(assignEvent).toMatchObject({ actorId: "emp-grace", action: "assign-role" });
    expect(assignEvent?.detail).toContain("Katherine Johnson");
    expect(assignEvent?.detail).toContain("Manager");
  });

  it("does not duplicate the assignment or audit event when the role is unchanged", async () => {
    const { admin, store } = buildAdmin();
    const role = await store.createRole("org-1", {
      code: "manager",
      displayName: "Manager",
      departmentId: null,
    });

    await admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id });
    await admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id });

    expect(store.audit.filter((event) => event.action === "assign-role")).toHaveLength(1);
  });
});

describe("assignDepartment", () => {
  it("lets an admin assign a department to an employee", async () => {
    const { admin } = buildAdmin();
    const dept = await admin.createDepartment("emp-grace", { name: "Operations" });

    await admin.assignDepartment("emp-grace", { employeeId: "emp-katherine", departmentId: dept.id });

    const people = await admin.listEmployees("emp-grace");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      department: "Operations",
    });
  });
});

describe("departments", () => {
  it("lets an admin create a department", async () => {
    const { admin } = buildAdmin();

    const department = await admin.createDepartment("emp-grace", { name: "Engineering" });

    expect(department).toMatchObject({ name: "Engineering", active: true });
    await expect(admin.listDepartments("emp-grace")).resolves.toMatchObject([
      { name: "Engineering" },
    ]);
  });

  it("rejects a department without a name", async () => {
    const { admin } = buildAdmin();

    await expect(admin.createDepartment("emp-grace", { name: "  " })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a duplicate department name in the same organization", async () => {
    const { admin } = buildAdmin();
    await admin.createDepartment("emp-grace", { name: "Engineering" });

    await expect(admin.createDepartment("emp-grace", { name: "Engineering" })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(admin.createDepartment("emp-katherine", { name: "Engineering" })).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("lets an admin deactivate a department", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-grace", { name: "Engineering" });

    await admin.deactivateDepartment("emp-grace", department.id);

    const departments = await admin.listDepartments("emp-grace");
    expect(departments.find((candidate) => candidate.id === department.id)).toMatchObject({
      active: false,
    });
  });

  it("rejects deactivating an unknown department", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deactivateDepartment("emp-grace", "dept-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("roles", () => {
  it("lets an admin create a department-scoped role", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-grace", { name: "Engineering" });

    const role = await admin.createRole("emp-grace", {
      code: "team-lead",
      displayName: "Team Lead",
      departmentId: department.id,
    });

    expect(role).toMatchObject({ code: "team-lead", displayName: "Team Lead", departmentId: department.id });
  });

  it("lets an admin create an organization-wide role with no department", async () => {
    const { admin } = buildAdmin();

    const role = await admin.createRole("emp-grace", {
      code: "superadmin-2",
      displayName: "Superadmin",
      departmentId: null,
    });

    expect(role.departmentId).toBeNull();
  });

  it("rejects a role with a missing code or display name", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createRole("emp-grace", { code: "", displayName: "Team Lead", departmentId: null }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a role scoped to an unknown department", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createRole("emp-grace", {
        code: "team-lead",
        displayName: "Team Lead",
        departmentId: "dept-missing",
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a role scoped to a deactivated department", async () => {
    const { admin } = buildAdmin();
    const department = await admin.createDepartment("emp-grace", { name: "Engineering" });
    await admin.deactivateDepartment("emp-grace", department.id);

    await expect(
      admin.createRole("emp-grace", {
        code: "team-lead",
        displayName: "Team Lead",
        departmentId: department.id,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a duplicate role code in the same organization", async () => {
    const { admin } = buildAdmin();
    await admin.createRole("emp-grace", { code: "team-lead", displayName: "Team Lead", departmentId: null });

    await expect(
      admin.createRole("emp-grace", { code: "team-lead", displayName: "Team Lead 2", departmentId: null }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects deactivating a role currently assigned to an employee", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "manager", displayName: "Manager", departmentId: null });
    await admin.assignRole("emp-grace", { employeeId: "emp-katherine", roleId: role.id });

    await expect(admin.deactivateRole("emp-grace", role.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects deactivating a role referenced by a published flow", async () => {
    const { admin } = buildAdmin();
    const targetRole = await admin.createRole("emp-grace", { code: "intern", displayName: "Intern", departmentId: null });
    const stepRole = await admin.createRole("emp-grace", { code: "team-lead", displayName: "Team Lead", departmentId: null });
    const flow = await admin.createFlow("emp-grace", {
      name: "Intern flow",
      roleId: targetRole.id,
      steps: [stepRole.id],
    });
    await admin.publishFlow("emp-grace", flow.id);

    await expect(admin.deactivateRole("emp-grace", stepRole.id)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("allows deactivating a role referenced only by a draft flow", async () => {
    const { admin } = buildAdmin();
    const targetRole = await admin.createRole("emp-grace", { code: "intern", displayName: "Intern", departmentId: null });
    const stepRole = await admin.createRole("emp-grace", { code: "team-lead", displayName: "Team Lead", departmentId: null });
    await admin.createFlow("emp-grace", {
      name: "Intern flow",
      roleId: targetRole.id,
      steps: [stepRole.id],
    });

    await expect(admin.deactivateRole("emp-grace", stepRole.id)).resolves.toBeUndefined();
  });

  it("lets an admin deactivate an unreferenced role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "intern", displayName: "Intern", departmentId: null });

    await admin.deactivateRole("emp-grace", role.id);

    const roles = await admin.listRoles("emp-grace");
    expect(roles.find((candidate) => candidate.id === role.id)).toMatchObject({ active: false });
  });
});

describe("createFlow", () => {
  it("creates a draft flow assigned to a role with ordered role steps", async () => {
    const { admin } = buildAdmin();
    const executiveRole = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const managerRole = await admin.createRole("emp-grace", { code: "manager", displayName: "Manager", departmentId: null });

    const flow = await admin.createFlow("emp-grace", {
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      steps: [managerRole.id],
    });

    expect(flow).toMatchObject({
      name: "Standard reimbursement",
      roleId: executiveRole.id,
      status: "draft",
      steps: [managerRole.id],
    });
    expect(flow.id).toBeTruthy();
  });

  it("rejects a flow without a name", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });

    await expect(
      admin.createFlow("emp-grace", { name: "   ", roleId: role.id, steps: [role.id] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow assigned to an unknown role", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: "role-missing", steps: [] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a duplicate draft flow with the same name and role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const input = { name: "Standard reimbursement", roleId: role.id, steps: [role.id] };

    await admin.createFlow("emp-grace", input);

    await expect(admin.createFlow("emp-grace", input)).rejects.toMatchObject({ code: "validation" });
  });

  it("allows the same draft name for a different role", async () => {
    const { admin } = buildAdmin();
    const roleA = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const roleB = await admin.createRole("emp-grace", { code: "intern", displayName: "Intern", departmentId: null });

    await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: roleA.id, steps: [roleA.id] });

    await expect(
      admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: roleB.id, steps: [roleB.id] }),
    ).resolves.toMatchObject({ roleId: roleB.id });
  });

  it("rejects a flow without any steps", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });

    await expect(
      admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [] }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow with more than 15 steps", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const steps = Array.from({ length: 16 }, () => role.id);

    await expect(
      admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow step that is not a known role", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });

    await expect(
      admin.createFlow("emp-grace", {
        name: "Standard reimbursement",
        roleId: role.id,
        steps: [role.id, "role-missing"],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });

    await expect(
      admin.createFlow("emp-katherine", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("records an audit event when a flow draft is created", async () => {
    const { admin, store } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });

    await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] });

    expect(store.audit.map((event) => event.action)).toContain("create-flow-draft");
  });
});

describe("publishFlow", () => {
  it("publishes a draft flow", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const flow = await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] });

    const published = await admin.publishFlow("emp-grace", flow.id);

    expect(published.status).toBe("published");
  });

  it("allows multiple flows to remain active and published concurrently", async () => {
    const { admin } = buildAdmin();
    const role1 = await admin.createRole("emp-grace", { code: "intern-eng", displayName: "Engineering Intern", departmentId: null });
    const role2 = await admin.createRole("emp-grace", { code: "intern-mkt", displayName: "Marketing Intern", departmentId: null });
    const firstFlow = await admin.createFlow("emp-grace", { name: "Engineering Flow", roleId: role1.id, steps: [role1.id] });
    await admin.publishFlow("emp-grace", firstFlow.id);
    const secondFlow = await admin.createFlow("emp-grace", { name: "Marketing Flow", roleId: role2.id, steps: [role2.id] });

    await admin.publishFlow("emp-grace", secondFlow.id);

    const flows = await admin.listFlows("emp-grace");
    expect(flows.find((flow) => flow.id === firstFlow.id)).toMatchObject({ status: "published" });
    expect(flows.find((flow) => flow.id === secondFlow.id)).toMatchObject({ status: "published" });
  });

  it("rejects publishing an already-published flow", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const flow = await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] });
    await admin.publishFlow("emp-grace", flow.id);

    await expect(admin.publishFlow("emp-grace", flow.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects publishing an unknown flow", async () => {
    const { admin } = buildAdmin();

    await expect(admin.publishFlow("emp-grace", "flow-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const flow = await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] });

    await expect(admin.publishFlow("emp-katherine", flow.id)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("listEmployees and listFlows", () => {
  it("lists people to an authorized administrator", async () => {
    const { admin } = buildAdmin();

    const people = await admin.listEmployees("emp-grace");

    expect(people).toHaveLength(3);
    expect(people[0]).toMatchObject({ name: "Grace Hopper", role: { displayName: "HR administrator" } });
  });

  it("only returns people from the actor's own organization", async () => {
    const { admin } = buildAdmin();

    const people = await admin.listEmployees("emp-grace");

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

    await expect(admin.listFlows("emp-grace")).resolves.toEqual([]);
  });
});

describe("deleteFlow", () => {
  it("deletes a flow draft", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-grace", { code: "executive", displayName: "Executive", departmentId: null });
    const flow = await admin.createFlow("emp-grace", { name: "Standard reimbursement", roleId: role.id, steps: [role.id] });

    await admin.deleteFlow("emp-grace", flow.id);

    const flows = await admin.listFlows("emp-grace");
    expect(flows.find((candidate) => candidate.id === flow.id)).toBeUndefined();
  });

  it("rejects deleting an unknown flow", async () => {
    const { admin } = buildAdmin();

    await expect(admin.deleteFlow("emp-grace", "flow-missing")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
