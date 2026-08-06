import { describe, expect, it } from "vitest";
import type { AdminDepartment, AdminEmployee } from "@/server/admin/ports";
import { groupPeopleByDepartment } from "./org-tree-model";

const departments: AdminDepartment[] = [
  { id: "dept-engineering", organizationId: "org-1", name: "Engineering", active: true },
  { id: "dept-operations", organizationId: "org-1", name: "Operations", active: true },
];

function employee(id: string, overrides: Partial<AdminEmployee> = {}): AdminEmployee {
  return {
    id,
    organizationId: "org-1",
    name: `Person ${id}`,
    email: `${id}@example.com`,
    department: "",
    departmentId: null,
    role: null,
    active: true,
    managerId: null,
    ...overrides,
  };
}

describe("groupPeopleByDepartment", () => {
  it("groups people under the department matching their departmentId, keeping department order", () => {
    const groups = groupPeopleByDepartment(
      [
        employee("emp-1", { departmentId: "dept-operations", department: "Operations" }),
        employee("emp-2", { departmentId: "dept-engineering", department: "Engineering" }),
        employee("emp-3", { departmentId: "dept-engineering", department: "Engineering" }),
      ],
      departments,
    );

    expect(groups.map((group) => group.department?.name)).toEqual(["Engineering", "Operations"]);
    expect(groups[0]?.people.map((person) => person.id)).toEqual(["emp-2", "emp-3"]);
    expect(groups[1]?.people.map((person) => person.id)).toEqual(["emp-1"]);
  });

  it("matches a department by name when the person only carries the denormalized name", () => {
    const groups = groupPeopleByDepartment(
      [employee("emp-1", { department: "Operations" })],
      departments,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.department?.id).toBe("dept-operations");
    expect(groups[0]?.people).toHaveLength(1);
  });

  it("collects people without a department in a final 'No department' group", () => {
    const groups = groupPeopleByDepartment(
      [
        employee("emp-1", { departmentId: "dept-engineering", department: "Engineering" }),
        employee("emp-2"),
      ],
      departments,
    );

    expect(groups).toHaveLength(2);
    expect(groups[1]?.department).toBeNull();
    expect(groups[1]?.people.map((person) => person.id)).toEqual(["emp-2"]);
  });

  it("drops empty departments and omits the 'No department' group when nobody is unallocated", () => {
    const groups = groupPeopleByDepartment(
      [employee("emp-1", { departmentId: "dept-engineering", department: "Engineering" })],
      departments,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.department?.id).toBe("dept-engineering");
  });

  it("prefers the departmentId over a stale name string", () => {
    const groups = groupPeopleByDepartment(
      [employee("emp-1", { departmentId: "dept-engineering", department: "Operations" })],
      departments,
    );

    expect(groups[0]?.department?.id).toBe("dept-engineering");
  });
});
