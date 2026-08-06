import { describe, expect, it } from "vitest";
import { AdminError, createAdminCommands } from "./commands";
import { InMemoryAdminStore } from "./in-memory";
import type { AdminEmployee, AdminRole, AuditEvent, FlowStepInput } from "./ports";

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

function buildAdmin(roles: AdminRole[] = []) {
  const store = new InMemoryAdminStore(employees.map((employee) => ({ ...employee })), roles);
  const admin = createAdminCommands({ store });
  return { admin, store };
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
    const dept = await admin.createDepartment("emp-superadmin", { name: "Operations" });

    await admin.assignDepartment("emp-superadmin", { employeeId: "emp-katherine", departmentId: dept.id });

    const people = await admin.listEmployees("emp-superadmin");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      department: "Operations",
    });
  });
});

describe("departments", () => {
  it("lets an admin create a department", async () => {
    const { admin } = buildAdmin();

    const department = await admin.createDepartment("emp-superadmin", { name: "Engineering" });

    expect(department).toMatchObject({ name: "Engineering", active: true });
    await expect(admin.listDepartments("emp-superadmin")).resolves.toMatchObject([
      { name: "Engineering" },
    ]);
  });

  it("rejects a department without a name", async () => {
    const { admin } = buildAdmin();

    await expect(admin.createDepartment("emp-superadmin", { name: "  " })).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a duplicate department name in the same organization", async () => {
    const { admin } = buildAdmin();
    await admin.createDepartment("emp-superadmin", { name: "Engineering" });

    await expect(admin.createDepartment("emp-superadmin", { name: "Engineering" })).rejects.toMatchObject({
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
    const department = await admin.createDepartment("emp-superadmin", { name: "Engineering" });

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
    await admin.createDepartment("emp-superadmin", { name: "Engineering" });

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
    const flow = await admin.createFlow("emp-superadmin", {
      name: "Intern flow",
      roleId: targetRole.id,
      steps: [roleStep(stepRole.id)],
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
});

describe("publishFlow", () => {
  it("publishes a draft flow", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const flow = await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] });

    const published = await admin.publishFlow("emp-superadmin", flow.id);

    expect(published.status).toBe("published");
  });

  it("allows multiple flows to remain active and published concurrently", async () => {
    const { admin } = buildAdmin();
    const role1 = await admin.createRole("emp-superadmin", { code: "intern-eng", displayName: "Engineering Intern" });
    const role2 = await admin.createRole("emp-superadmin", { code: "intern-mkt", displayName: "Marketing Intern" });
    const firstFlow = await admin.createFlow("emp-superadmin", { name: "Engineering Flow", roleId: role1.id, steps: [roleStep(role1.id)] });
    await admin.publishFlow("emp-superadmin", firstFlow.id);
    const secondFlow = await admin.createFlow("emp-superadmin", { name: "Marketing Flow", roleId: role2.id, steps: [roleStep(role2.id)] });

    await admin.publishFlow("emp-superadmin", secondFlow.id);

    const flows = await admin.listFlows("emp-superadmin");
    expect(flows.find((flow) => flow.id === firstFlow.id)).toMatchObject({ status: "published" });
    expect(flows.find((flow) => flow.id === secondFlow.id)).toMatchObject({ status: "published" });
  });

  it("rejects publishing an already-published flow", async () => {
    const { admin } = buildAdmin();
    const role = await admin.createRole("emp-superadmin", { code: "executive", displayName: "Executive" });
    const flow = await admin.createFlow("emp-superadmin", { name: "Standard reimbursement", roleId: role.id, steps: [roleStep(role.id)] });
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
    const admin = createAdminCommands({ store });

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
