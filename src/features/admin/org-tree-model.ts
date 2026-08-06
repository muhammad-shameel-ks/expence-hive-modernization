import type { AdminDepartment, AdminEmployee } from "@/server/admin/ports";

export type DepartmentGroup = {
  // Null marks the fallback bucket for people without a department.
  department: AdminDepartment | null;
  people: AdminEmployee[];
};

/**
 * Groups people by their department. A person belongs to a department when
 * their departmentId matches, or (for data that predates the id column) when
 * their department name string matches. Everyone else lands in a final
 * "No department" bucket, which is omitted when empty. Departments with no
 * members are dropped so the tree only shows populated structure.
 */
export function groupPeopleByDepartment(
  people: AdminEmployee[],
  departments: AdminDepartment[],
): DepartmentGroup[] {
  const groups: DepartmentGroup[] = departments.map((department) => ({
    department,
    people: [],
  }));
  const unallocated: AdminEmployee[] = [];

  for (const person of people) {
    const department = departments.find((candidate) =>
      person.departmentId != null
        ? candidate.id === person.departmentId
        : person.department === candidate.name,
    );
    if (department) {
      groups.find((group) => group.department === department)?.people.push(person);
    } else {
      unallocated.push(person);
    }
  }

  const populated = groups.filter((group) => group.people.length > 0);
  if (unallocated.length > 0) {
    populated.push({ department: null, people: unallocated });
  }
  return populated;
}
