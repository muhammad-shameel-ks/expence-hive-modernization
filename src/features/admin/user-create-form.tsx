"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AdminDepartment,
  AdminEmployee,
  AdminRole,
  AdminRoleRef,
} from "@/server/admin/ports";

// The admin user-creation form (ADR-0019): name, email, role and department
// up front; the manager is always the department head, read-only here - a
// headless department blocks submission until a head is assigned in
// Departments & Roles. The server validates everything again; the form only
// shapes the request.
export function UserCreateForm({
  people,
  roles,
  departments,
  onCreated,
  onMessage,
  onError,
}: {
  people: AdminEmployee[];
  roles: AdminRole[];
  departments: AdminDepartment[];
  onCreated: (employee: AdminEmployee) => void;
  onMessage: (message: string) => void;
  onError: (error: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [saving, setSaving] = useState(false);

  const activeDepartments = useMemo(() => departments.filter((d) => d.active), [departments]);
  const activeRoles = useMemo(() => roles.filter((role) => role.active), [roles]);

  const selectedDepartment = useMemo(
    () => activeDepartments.find((dept) => dept.id === departmentId) ?? null,
    [activeDepartments, departmentId],
  );

  const effectiveManagerId = selectedDepartment?.head?.id ?? managerId;

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    roleId !== "" &&
    departmentId !== "" &&
    effectiveManagerId !== "" &&
    !saving;

  const selectDepartment = (id: string) => {
    setDepartmentId(id);
    const dept = activeDepartments.find((candidate) => candidate.id === id);
    setManagerId(dept?.head?.id ?? "");
  };

  const submit = async () => {
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, roleId, departmentId, managerId: effectiveManagerId }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "unknown");
      }
      const body = (await response.json()) as { employee: AdminEmployee };
      onCreated(body.employee);
      onMessage(`${body.employee.name} created with the ${roleName(body.employee.role)} role.`);
      setName("");
      setEmail("");
      setRoleId("");
      setDepartmentId("");
      setManagerId("");
    } catch (caught) {
      onError(
        caught instanceof Error && caught.message === "unauthorized"
          ? "Only Superadmin can create users."
          : "The user could not be created. Check the form details and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[18px] border border-[#e0e7ee] bg-white p-5 shadow-[0_18px_38px_rgba(31,50,71,0.05)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1c2f46]">
        <UserPlus className="size-4 text-[#196d86]" />
        Create user
      </h3>
      <p className="mt-1 text-xs text-[#7d8a9b]">
        Pre-provision a person: they pick this account up on their first sign-in with company identity.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <FormLabel htmlFor="create-user-name">Name</FormLabel>
          <input
            id="create-user-name"
            className="mt-1.5 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Grace Hopper"
          />
        </div>
        <div>
          <FormLabel htmlFor="create-user-email">Email</FormLabel>
          <input
            id="create-user-email"
            type="email"
            className="mt-1.5 h-10 w-full rounded-lg border border-[#d6dfe8] px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="grace@hive.local"
          />
        </div>
        <div>
          <FormLabel htmlFor="create-user-role">Role</FormLabel>
          <Select
            id="create-user-role"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            placeholder="Choose a role"
          >
            {activeRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.displayName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <FormLabel htmlFor="create-user-department">Department</FormLabel>
          <Select
            id="create-user-department"
            value={departmentId}
            onChange={(event) => selectDepartment(event.target.value)}
            placeholder="Choose a department"
          >
            {activeDepartments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
                {dept.head ? "" : " (no head)"}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <FormLabel htmlFor="create-user-manager">Manager</FormLabel>
          <input
            id="create-user-manager"
            readOnly
            className="mt-1.5 h-10 w-full rounded-lg border border-[#d6dfe8] bg-[#f8fafc] px-3 text-sm font-medium text-[#475569] outline-none cursor-not-allowed"
            value={
              selectedDepartment?.head
                ? headName(people, selectedDepartment.head.id)
                : selectedDepartment
                  ? "No manager assigned (department has no head)"
                  : "Choose a department to see manager"
            }
          />
          <p className="mt-1.5 text-xs text-[#9aa6b5]" role="note">
            {selectedDepartment?.head
              ? `Automatically assigned to the ${selectedDepartment.name} department head (${headName(people, selectedDepartment.head.id)}).`
              : selectedDepartment
                ? `The ${selectedDepartment.name} department has no head yet. Assign a head in Departments & Roles.`
                : "Picks up the department head once a department is chosen."}
          </p>
        </div>
      </div>

      <Button
        className="mt-4 bg-[#175d75] px-4 text-xs font-bold text-white hover:bg-[#114b5f]"
        loading={saving}
        disabled={!canSubmit}
        onClick={submit}
      >
        Create user
      </Button>
    </div>
  );
}

function roleName(role: AdminRoleRef | null): string {
  return role?.displayName ?? "no role";
}

function headName(people: AdminEmployee[], headId: string): string {
  return people.find((person) => person.id === headId)?.name ?? "an assigned head";
}

function FormLabel({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-[0.08em] text-[#8a96a8]">
      {children}
    </label>
  );
}

function Select({
  id,
  value,
  onChange,
  placeholder,
  children,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      className="mt-1.5 h-10 w-full appearance-none rounded-lg border border-[#d6dfe8] bg-white px-3 text-sm text-[#33445c] outline-none focus:border-[#8ab5c6] focus:ring-2 focus:ring-[#b7d8e5]"
      value={value}
      onChange={onChange}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {children}
    </select>
  );
}
