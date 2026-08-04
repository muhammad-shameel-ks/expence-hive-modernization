import { describe, expect, it } from "vitest";
import { createAdminCommands } from "./commands";
import { InMemoryAdminStore } from "./in-memory";
import type { AdminEmployee, AuditEvent } from "./ports";

const employees: AdminEmployee[] = [
  {
    id: "emp-grace",
    organizationId: "org-1",
    name: "Grace Hopper",
    email: "grace@hive.local",
    department: "Operations",
    role: "HR administrator",
  },
  {
    id: "emp-shameel",
    organizationId: "org-1",
    name: "Muhammad Shameel",
    email: "muhammadshameelks@hive.local",
    department: "Engineering",
    role: "System administrator",
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
    role: "HR administrator",
  },
];

function buildAdmin() {
  const store = new InMemoryAdminStore(employees.map((employee) => ({ ...employee })));
  const admin = createAdminCommands({ store });
  return { admin, store };
}

describe("assignRole", () => {
  it("lets an HR administrator assign a role to an employee", async () => {
    const { admin } = buildAdmin();

    await admin.assignRole("emp-grace", {
      employeeId: "emp-katherine",
      role: "Manager",
    });

    const people = await admin.listEmployees("emp-grace");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: "Manager",
    });
  });

  it("lets a system administrator assign a role to an employee", async () => {
    const { admin } = buildAdmin();

    await admin.assignRole("emp-shameel", {
      employeeId: "emp-katherine",
      role: "Finance reviewer",
    });

    const people = await admin.listEmployees("emp-shameel");
    expect(people.find((person) => person.id === "emp-katherine")).toMatchObject({
      role: "Finance reviewer",
    });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-katherine", {
        employeeId: "emp-grace",
        role: "Manager",
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects an unknown target employee", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-grace", {
        employeeId: "emp-missing",
        role: "Manager",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects assigning a role to an employee outside the actor's organization", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-grace", {
        employeeId: "emp-other-org",
        role: "Manager",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an invalid role value", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.assignRole("emp-grace", {
        employeeId: "emp-katherine",
        role: "Superuser" as never,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("records an audit event for a role assignment", async () => {
    const { admin, store } = buildAdmin();

    await admin.assignRole("emp-grace", {
      employeeId: "emp-katherine",
      role: "Manager",
    });

    const events: AuditEvent[] = store.audit;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: "emp-grace",
      action: "assign-role",
    });
    expect(events[0].detail).toContain("Katherine Johnson");
    expect(events[0].detail).toContain("Manager");
  });

  it("does not duplicate the assignment or audit event when the role is unchanged", async () => {
    const { admin, store } = buildAdmin();

    await admin.assignRole("emp-grace", {
      employeeId: "emp-katherine",
      role: "Manager",
    });
    await admin.assignRole("emp-grace", {
      employeeId: "emp-katherine",
      role: "Manager",
    });

    expect(store.audit).toHaveLength(1);
  });
});

describe("createFlowDraft", () => {
  it("creates a draft flow with ordered role steps", async () => {
    const { admin } = buildAdmin();

    const flow = await admin.createFlowDraft("emp-grace", {
      name: "Standard reimbursement",
      scope: "All departments",
      steps: ["Manager", "Finance reviewer", "CEO delegate"],
    });

    expect(flow).toMatchObject({
      name: "Standard reimbursement",
      scope: "All departments",
      status: "draft",
      steps: ["Manager", "Finance reviewer", "CEO delegate"],
    });
    expect(flow.id).toBeTruthy();
  });

  it("rejects a flow without a name", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "   ",
        scope: "All departments",
        steps: ["Manager"],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a duplicate draft flow with the same name and scope", async () => {
    const { admin } = buildAdmin();
    const input = {
      name: "Standard reimbursement",
      scope: "All departments",
      steps: ["Manager", "Finance reviewer"],
    };

    await admin.createFlowDraft("emp-grace", input);

    await expect(admin.createFlowDraft("emp-grace", input)).rejects.toMatchObject({
      code: "validation",
    });
  });

  it("rejects a flow without any steps", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "Standard reimbursement",
        scope: "All departments",
        steps: [],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow with an overlong name or scope", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "x".repeat(121),
        scope: "All departments",
        steps: ["Manager"],
      }),
    ).rejects.toMatchObject({ code: "validation" });

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "Standard reimbursement",
        scope: "y".repeat(61),
        steps: ["Manager"],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow with more than 15 steps", async () => {
    const { admin } = buildAdmin();
    const steps = Array.from({ length: 16 }, () => "Manager");

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "Standard reimbursement",
        scope: "All departments",
        steps,
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a flow step that is not a known role", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlowDraft("emp-grace", {
        name: "Standard reimbursement",
        scope: "All departments",
        steps: ["Manager", "Superuser" as never],
      }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("rejects a non-admin actor", async () => {
    const { admin } = buildAdmin();

    await expect(
      admin.createFlowDraft("emp-katherine", {
        name: "Standard reimbursement",
        scope: "All departments",
        steps: ["Manager"],
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("records an audit event when a flow draft is created", async () => {
    const { admin, store } = buildAdmin();

    await admin.createFlowDraft("emp-grace", {
      name: "Standard reimbursement",
      scope: "All departments",
      steps: ["Manager"],
    });

    expect(store.audit.map((event) => event.action)).toContain("create-flow-draft");
  });
});

describe("listEmployees and listFlows", () => {
  it("lists people to an authorized administrator", async () => {
    const { admin } = buildAdmin();

    const people = await admin.listEmployees("emp-grace");

    expect(people).toHaveLength(3);
    expect(people[0]).toMatchObject({ name: "Grace Hopper", role: "HR administrator" });
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
