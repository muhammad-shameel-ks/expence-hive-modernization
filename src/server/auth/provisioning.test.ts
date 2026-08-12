import { describe, expect, it } from "vitest";
import { createDevProvisioner } from "./provisioning";
import { InMemoryIdentityStore } from "./in-memory";
import { InMemoryAdminStore } from "../admin/in-memory";
import type { AdminEmployee, AdminRole } from "../admin/ports";
import type { Employee } from "./ports";

const EXECUTIVE_ROLE: AdminRole = {
  id: "role-executive",
  organizationId: "org-1",
  code: "executive",
  displayName: "Executive",
  departmentId: null,
  active: true,
  locked: true,
};

const EXISTING_EMPLOYEE: AdminEmployee = {
  id: "emp-ada",
  organizationId: "org-1",
  name: "Ada Lovelace",
  email: "ada@hive.local",
  department: "Engineering",
  departmentId: "dept-1",
  role: { id: "role-manager", code: "manager", displayName: "Manager" },
  active: true,
  managerId: null,
};

const EXISTING_IDENTITY: Employee = {
  id: "emp-ada",
  email: "ada@hive.local",
  name: "Ada Lovelace",
};

function build() {
  const identityProvider = new InMemoryIdentityStore([EXISTING_IDENTITY]);
  const adminStore = new InMemoryAdminStore([EXISTING_EMPLOYEE], [EXECUTIVE_ROLE]);
  const provisioner = createDevProvisioner({
    adminStore,
    identityProvider,
    organizationId: "org-1",
    defaultRoleCode: "executive",
  });
  return { provisioner, identityProvider, adminStore };
}

describe("createDevProvisioner", () => {
  it("creates the employee with the executive role and registers the identity", async () => {
    const { provisioner, identityProvider, adminStore } = build();

    const employee = await provisioner.provision("john.doe@hive.local");

    expect(employee).toMatchObject({
      id: expect.stringMatching(/^emp-/),
      email: "john.doe@hive.local",
      name: "John Doe",
    });
    expect(identityProvider.findByEmail("john.doe@hive.local")).toEqual(employee);

    const people = await adminStore.listEmployees("org-1");
    const created = people.find((person) => person.id === employee!.id);
    expect(created).toMatchObject({
      name: "John Doe",
      email: "john.doe@hive.local",
      department: "",
      departmentId: null,
      role: { id: "role-executive", code: "executive", displayName: "Executive" },
      active: true,
      managerId: null,
    });
  });

  it("normalizes the email before provisioning", async () => {
    const { provisioner, adminStore } = build();

    const employee = await provisioner.provision("  John.Doe@Hive.Local ");

    expect(employee).toMatchObject({ email: "john.doe@hive.local" });
    const people = await adminStore.listEmployees("org-1");
    expect(people.some((person) => person.email === "john.doe@hive.local")).toBe(true);
  });

  it("returns the existing identity on a second call without re-provisioning", async () => {
    const { provisioner, adminStore } = build();

    const first = await provisioner.provision("john.doe@hive.local");
    const second = await provisioner.provision("john.doe@hive.local");

    expect(second).toEqual(first);
    const people = await adminStore.listEmployees("org-1");
    expect(people.filter((person) => person.email === "john.doe@hive.local")).toHaveLength(1);
  });

  it("returns the already-known identity without touching the store", async () => {
    const { provisioner, adminStore } = build();

    const employee = await provisioner.provision("ada@hive.local");

    expect(employee).toEqual(EXISTING_IDENTITY);
    const people = await adminStore.listEmployees("org-1");
    expect(people).toHaveLength(1);
  });

  it("throws when the default role is missing", async () => {
    const identityProvider = new InMemoryIdentityStore([EXISTING_IDENTITY]);
    const adminStore = new InMemoryAdminStore([EXISTING_EMPLOYEE]);
    const provisioner = createDevProvisioner({
      adminStore,
      identityProvider,
      organizationId: "org-1",
      defaultRoleCode: "executive",
    });

    await expect(provisioner.provision("john.doe@hive.local")).rejects.toThrow(
      /default provisioning role "executive"/,
    );
  });

  it("never touches other employees", async () => {
    const { provisioner, adminStore } = build();

    await provisioner.provision("john.doe@hive.local");

    const people = await adminStore.listEmployees("org-1");
    expect(people).toHaveLength(2);
    expect(people.find((person) => person.id === "emp-ada")).toEqual(EXISTING_EMPLOYEE);
  });
});

describe("pre-created employee reconciliation (ADR-0019)", () => {
  it("picks up a pre-created employee record without touching admin-set fields", async () => {
    const identityProvider = new InMemoryIdentityStore([]);
    const adminStore = new InMemoryAdminStore(
      [
        {
          id: "emp-precreated",
          organizationId: "org-1",
          name: "Grace Hopper",
          email: "grace@hive.local",
          department: "Engineering",
          departmentId: "dept-1",
          role: { id: "role-manager", code: "manager", displayName: "Manager" },
          active: true,
          managerId: "emp-ada",
        },
      ],
      [EXECUTIVE_ROLE],
    );
    const provisioner = createDevProvisioner({
      adminStore,
      identityProvider,
      organizationId: "org-1",
      defaultRoleCode: "executive",
    });

    const employee = await provisioner.provision("grace@hive.local");

    expect(employee).toEqual({
      id: "emp-precreated",
      email: "grace@hive.local",
      name: "Grace Hopper",
    });
    expect(identityProvider.findByEmail("grace@hive.local")).toEqual(employee);
    const people = await adminStore.listEmployees("org-1");
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      id: "emp-precreated",
      name: "Grace Hopper",
      role: { id: "role-manager", code: "manager", displayName: "Manager" },
      departmentId: "dept-1",
      managerId: "emp-ada",
      active: true,
    });
  });

  it("normalizes the email when matching a pre-created record", async () => {
    const identityProvider = new InMemoryIdentityStore([]);
    const adminStore = new InMemoryAdminStore([
      {
        id: "emp-precreated",
        organizationId: "org-1",
        name: "Grace Hopper",
        email: "grace@hive.local",
        department: "",
        departmentId: null,
        role: null,
        active: true,
        managerId: null,
      },
    ]);
    const provisioner = createDevProvisioner({
      adminStore,
      identityProvider,
      organizationId: "org-1",
      defaultRoleCode: "executive",
    });

    const employee = await provisioner.provision("  Grace@Hive.Local ");

    expect(employee?.id).toBe("emp-precreated");
    expect(employee?.email).toBe("grace@hive.local");
  });

  it("creates a fresh record when the email matches nobody", async () => {
    const identityProvider = new InMemoryIdentityStore([]);
    const adminStore = new InMemoryAdminStore([], [EXECUTIVE_ROLE]);
    const provisioner = createDevProvisioner({
      adminStore,
      identityProvider,
      organizationId: "org-1",
      defaultRoleCode: "executive",
    });

    const employee = await provisioner.provision("new.person@hive.local");

    expect(employee?.id).toMatch(/^emp-/);
    const people = await adminStore.listEmployees("org-1");
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ email: "new.person@hive.local" });
  });

  it("does not duplicate a record when a pre-created employee signs in twice", async () => {
    const identityProvider = new InMemoryIdentityStore([]);
    const adminStore = new InMemoryAdminStore([
      {
        id: "emp-precreated",
        organizationId: "org-1",
        name: "Grace Hopper",
        email: "grace@hive.local",
        department: "",
        departmentId: null,
        role: null,
        active: true,
        managerId: null,
      },
    ]);
    const provisioner = createDevProvisioner({
      adminStore,
      identityProvider,
      organizationId: "org-1",
      defaultRoleCode: "executive",
    });

    const first = await provisioner.provision("grace@hive.local");
    const second = await provisioner.provision("grace@hive.local");

    expect(second).toEqual(first);
    const people = await adminStore.listEmployees("org-1");
    expect(people).toHaveLength(1);
  });
});
